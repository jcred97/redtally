import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { expenseImportKey, MAX_IMPORT_ROWS } from "@/app/lib/expenses/import";
import { parseExpenseInput } from "../expenses/access";

const MAX_RECORD_ID = 2_147_483_647;
const SUBMISSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_NOT_FOUND = "Expense group not found.";
const CATEGORY_NOT_FOUND = "Category not found in this expense group.";

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_RECORD_ID;
}

function parseRows(input: unknown) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_IMPORT_ROWS) {
    throw new TypeError(`Choose between 1 and ${MAX_IMPORT_ROWS} expense rows.`);
  }

  const rowNumbers = new Set<number>();
  const submissionIds = new Set<string>();
  return Array.from(input, (row: unknown) => {
    if (row === null || typeof row !== "object") throw new TypeError("Invalid expense row.");

    const { rowNumber, submissionId, title, amount, date } = row as Record<string, unknown>;
    if (!validId(rowNumber) || rowNumbers.has(rowNumber)) throw new TypeError("Invalid or repeated row number.");
    if (typeof submissionId !== "string" || submissionId.length !== 36 || !SUBMISSION_ID_PATTERN.test(submissionId)) {
      throw new TypeError(`Row ${rowNumber} is missing a valid draft ID.`);
    }

    const id = submissionId.toLowerCase();
    if (submissionIds.has(id)) throw new TypeError(`Row ${rowNumber} repeats a draft ID.`);
    rowNumbers.add(rowNumber);
    submissionIds.add(id);

    try {
      if (typeof title === "string" && title.includes("\0")) throw new TypeError("Title contains an invalid character.");
      return { rowNumber, id, values: parseExpenseInput({ title, amount, date }) };
    } catch (error) {
      if (error instanceof TypeError) throw new TypeError(`Row ${rowNumber}: ${error.message}`);
      throw error;
    }
  });
}

type ParsedExpense = ReturnType<typeof parseExpenseInput>;

function expenseKey({ title, amountCentavos, date }: ParsedExpense) {
  return JSON.stringify([title, amountCentavos, date.toISOString().slice(0, 10)]);
}

function duplicateKey({ title, amountCentavos, date }: ParsedExpense) {
  return expenseImportKey(title, date.toISOString().slice(0, 10), amountCentavos);
}

export function createExpenseImportAccess(db: PrismaClient, requireUserId: () => Promise<string>) {
  return {
    async preview(expenseGroupId: unknown, input: unknown): Promise<number[]> {
      const userId = await requireUserId();
      if (!validId(expenseGroupId)) throw new TypeError(GROUP_NOT_FOUND);
      const rows = parseRows(input);
      const group = await db.expenseGroup.findUnique({
        where: { id: expenseGroupId, userId },
        select: { id: true },
      });
      if (!group) throw new TypeError(GROUP_NOT_FOUND);

      const datesAndAmounts = new Map<string, { amountCentavos: number; date: { gte: Date; lt: Date } }>();
      for (const { values: { amountCentavos, date } } of rows) {
        datesAndAmounts.set(`${date.getTime()}:${amountCentavos}`, {
          amountCentavos,
          date: { gte: date, lt: new Date(date.getTime() + 86_400_000) },
        });
      }
      const existing = await db.expense.findMany({
        where: {
          expenseGroupId,
          category: { expenseGroup: { userId } },
          OR: [...datesAndAmounts.values()],
        },
        select: { title: true, amountCentavos: true, date: true },
      });
      const keys = new Set(existing.map(duplicateKey));
      return rows.filter(({ values }) => keys.has(duplicateKey(values))).map(({ rowNumber }) => rowNumber);
    },

    async save(expenseGroupId: unknown, categoryId: unknown, input: unknown): Promise<number> {
      const userId = await requireUserId();
      if (!validId(expenseGroupId) || !validId(categoryId)) throw new TypeError(CATEGORY_NOT_FOUND);

      const rows = parseRows(input).map((row) => ({
        ...row,
        payloadHash: createHash("sha256")
          .update(JSON.stringify(["expense-import", categoryId, expenseKey(row.values)]))
          .digest("hex"),
      }));
      // Claim overlapping submissions in the same order even when the preview order differs.
      rows.sort((left, right) => left.id.localeCompare(right.id));

      return db.$transaction(async (tx) => {
        const [category] = await tx.$queryRaw<{ id: number }[]>`
          SELECT category.id FROM "Category" AS category
          JOIN "Spending" AS expense_group ON expense_group.id = category."spendingId"
          WHERE category.id = ${categoryId} AND expense_group.id = ${expenseGroupId}
            AND expense_group."userId" = ${userId}
          FOR SHARE OF category, expense_group
        `;
        if (!category) throw new TypeError(CATEGORY_NOT_FOUND);

        const claimed = await tx.expenseSubmission.createManyAndReturn({
          data: rows.map(({ id, payloadHash }) => ({ id, expenseGroupId, payloadHash })),
          skipDuplicates: true,
          select: { id: true },
        });
        const claimedIds = new Set(claimed.map(({ id }) => id));
        const previouslyClaimed = rows.filter(({ id }) => !claimedIds.has(id));

        if (previouslyClaimed.length > 0) {
          const existing = await tx.expenseSubmission.findMany({
            where: { expenseGroupId, id: { in: previouslyClaimed.map(({ id }) => id) } },
            select: { id: true, payloadHash: true, expenseId: true },
          });
          const byId = new Map(existing.map((submission) => [submission.id, submission]));
          for (const { id, payloadHash, rowNumber } of previouslyClaimed) {
            const submission = byId.get(id);
            if (submission?.payloadHash !== payloadHash) {
              throw new TypeError(`Row ${rowNumber} was already saved with different details.`);
            }
            if (submission.expenseId === null) {
              throw new TypeError(`Row ${rowNumber} was already saved and has since been deleted.`);
            }
          }
        }

        const newRows = rows.filter(({ id }) => claimedIds.has(id));
        if (newRows.length > 0) {
          const created = await tx.expense.createManyAndReturn({
            data: newRows.map(({ values }) => ({ ...values, expenseGroupId, categoryId })),
            select: { id: true, title: true, amountCentavos: true, date: true },
          });

          // The database may return rows in any order. Identical expenses share a bucket.
          const createdByKey = new Map<string, number[]>();
          for (const expense of created) {
            const key = expenseKey(expense);
            const ids = createdByKey.get(key) ?? [];
            ids.push(expense.id);
            createdByKey.set(key, ids);
          }
          const links = newRows.map(({ id, values }) => {
            const expenseId = createdByKey.get(expenseKey(values))?.pop();
            if (expenseId === undefined) throw new Error("Unable to link an imported expense.");
            return Prisma.sql`(${id}::uuid, ${expenseId}::integer)`;
          });
          await tx.$executeRaw`
            UPDATE "ExpenseSubmission" AS submission SET "expenseId" = new_expense.expense_id
            FROM (VALUES ${Prisma.join(links)}) AS new_expense(id, expense_id)
            WHERE submission."expenseGroupId" = ${expenseGroupId} AND submission.id = new_expense.id
          `;
        }

        return rows.length;
      });
    },
  };
}
