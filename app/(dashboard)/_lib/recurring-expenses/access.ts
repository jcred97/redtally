import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getManilaToday, parseExpenseDate } from "@/app/lib/expenses/date";
import { getRecurringDateOnOrAfter, recurrenceFrequencies, type RecurrenceFrequency } from "@/app/lib/expenses/recurrence";
import { parseExpenseInput, parsePaymentSelection, validateBankSelection } from "../expenses/access";
import { drainRecurringExpenses, RECURRING_WORK_BUDGET_MS } from "./worker";

const NOT_FOUND = "Recurring expense not found in this expense group.";
const SUBMISSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const commands = ["create", "edit", "pause", "resume", "delete"] as const;
export type RecurringExpenseCommand = (typeof commands)[number];

function validId(id: number) {
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647;
}

function readId(value: FormDataEntryValue | null) {
  return typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : NaN;
}

function readRule(formData: FormData) {
  const categoryId = readId(formData.get("categoryId"));
  if (!validId(categoryId)) throw new TypeError("Choose a category from this expense group.");

  const frequency = formData.get("frequency") as RecurrenceFrequency;
  if (!recurrenceFrequencies.includes(frequency)) throw new TypeError("Choose a frequency.");

  const input = {
    title: formData.get("title"),
    amount: formData.get("amount"),
    date: formData.get("startDate"),
    paymentMethod: formData.get("paymentMethod"),
    bankAssignmentId: formData.get("bankAssignmentId"),
  };
  const { title, amountCentavos, date: startDate } = parseExpenseInput(input);
  const rawEnd = formData.get("endDate");
  const endDate = rawEnd === null || rawEnd === "" ? null : parseExpenseDate(rawEnd);
  if (endDate && endDate < startDate) throw new TypeError("End date must be on or after the start date.");

  const payment = parsePaymentSelection(input);
  if (payment?.paymentMethod === "PAY_LATER") {
    throw new TypeError("Set up Pay Later when recording an individual expense.");
  }
  return {
    categoryId, title, amountCentavos, frequency, startDate, endDate,
    paymentMethod: payment?.paymentMethod ?? null,
    bankAssignmentId: payment?.bankAssignmentId ?? null,
  };
}

async function createRule(
  tx: Prisma.TransactionClient,
  expenseGroupId: number,
  userId: string,
  values: ReturnType<typeof readRule>,
  submissionId: FormDataEntryValue | null,
) {
  if (typeof submissionId !== "string" || submissionId.length !== 36 || !SUBMISSION_ID_PATTERN.test(submissionId)) {
    throw new TypeError("Unable to identify this draft. Refresh the page and try again.");
  }
  const [group] = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Spending" WHERE id = ${expenseGroupId} AND "userId" = ${userId} FOR SHARE
  `;
  if (!group) throw new TypeError(NOT_FOUND);

  const key = { expenseGroupId, id: submissionId.toLowerCase() };
  const where = { expenseGroupId_id: key };
  // Keep the persisted hash independent of form field order and the rule's later edits.
  const payloadHash = createHash("sha256").update(JSON.stringify([
    values.categoryId, values.title, values.amountCentavos, values.frequency,
    values.startDate, values.endDate, values.paymentMethod, values.bankAssignmentId,
  ])).digest("hex");
  // A competing retry waits for the original transaction to commit or roll back.
  const claim = await tx.recurringExpenseSubmission.createMany({
    data: { ...key, payloadHash }, skipDuplicates: true,
  });
  if (claim.count === 0) {
    const previous = await tx.recurringExpenseSubmission.findUniqueOrThrow({ where });
    if (previous.payloadHash !== payloadHash) {
      throw new TypeError("This draft was already saved with different details. Close it and review the saved schedule.");
    }
    if (previous.recurringExpenseId === null) {
      throw new TypeError("This schedule was already saved and has since been deleted.");
    }
    return;
  }

  await validateBankSelection(tx, expenseGroupId, values);
  const rule = await tx.recurringExpense.create({
    data: { ...values, expenseGroupId, nextDueDate: values.startDate }, select: { id: true },
  });
  await tx.recurringExpenseSubmission.update({ where, data: { recurringExpenseId: rule.id } });
}

export function createRecurringExpenseAccess(
  db: PrismaClient,
  requireUserId: () => Promise<string>,
  today: () => Date = () => parseExpenseDate(getManilaToday()),
) {
  return {
    async runDue(expenseGroupId: number) {
      const userId = await requireUserId();
      const group = { id: expenseGroupId, userId };
      if (!validId(expenseGroupId) || !(await db.expenseGroup.findUnique({ where: group, select: { id: true } }))) {
        throw new TypeError("Expense group not found.");
      }

      const deadline = performance.now() + RECURRING_WORK_BUDGET_MS;
      return drainRecurringExpenses(db, today(), () => performance.now() < deadline, group);
    },

    async list(expenseGroupId: number) {
      const userId = await requireUserId();
      if (!validId(expenseGroupId)) return [];

      return db.recurringExpense.findMany({
        where: { expenseGroupId, expenseGroup: { userId } },
        include: {
          category: { select: { name: true } },
          bankAssignment: { select: { bank: { select: { name: true } } } },
        },
        orderBy: [{ nextDueDate: "asc" }, { id: "asc" }],
      });
    },

    async change(expenseGroupId: number, id: number | null, command: RecurringExpenseCommand, formData: FormData) {
      const userId = await requireUserId();
      if (!commands.includes(command) || !validId(expenseGroupId) ||
        (command !== "create" && (id === null || !validId(id)))) {
        throw new TypeError(NOT_FOUND);
      }

      const values = command === "create" || command === "edit" ? readRule(formData) : null;

      try {
        await db.$transaction(async (tx) => {
          if (command === "create" && values) {
            return createRule(tx, expenseGroupId, userId, values, formData.get("submissionId"));
          }

          // Serialize owner changes with the worker before reading the current schedule.
          const [locked] = await tx.$queryRaw<{ id: number }[]>`
            SELECT rule.id FROM "RecurringExpense" rule
            JOIN "Spending" expense_group ON expense_group.id = rule."expenseGroupId"
            WHERE rule.id = ${id} AND expense_group.id = ${expenseGroupId} AND expense_group."userId" = ${userId}
            FOR UPDATE OF rule FOR SHARE OF expense_group
          `;
          if (!locked) throw new TypeError(NOT_FOUND);
          const rule = await tx.recurringExpense.findUniqueOrThrow({ where: { id: locked.id } });

          if (command === "edit" && values) {
            await validateBankSelection(tx, expenseGroupId, values);
            let nextDueDate = rule.nextDueDate;
            if (values.startDate.getTime() !== rule.startDate.getTime() || values.frequency !== rule.frequency) {
              const last = await tx.recurringExpenseOccurrence.findFirst({
                where: { recurringExpenseId: rule.id }, orderBy: { dueDate: "desc" }, select: { dueDate: true },
              });
              // A schedule change only applies from today, after any dates already posted.
              let cutoff = today();
              if (last && last.dueDate >= cutoff) {
                cutoff = new Date(last.dueDate);
                cutoff.setUTCDate(cutoff.getUTCDate() + 1);
              }
              nextDueDate = getRecurringDateOnOrAfter(values.startDate, values.frequency, cutoff);
            }
            await tx.recurringExpense.update({ where: { id: rule.id }, data: { ...values, nextDueDate } });
          } else if (command === "pause" && rule.status === "ACTIVE") {
            await tx.recurringExpense.update({ where: { id: rule.id }, data: { status: "PAUSED" } });
          } else if (command === "resume" && rule.status !== "ACTIVE") {
            await validateBankSelection(tx, expenseGroupId, rule);
            const cutoff = today();
            const nextDueDate = formData.get("backfill") !== "on" && rule.nextDueDate < cutoff
              ? getRecurringDateOnOrAfter(rule.startDate, rule.frequency, cutoff)
              : rule.nextDueDate;
            await tx.recurringExpense.update({ where: { id: rule.id }, data: { status: "ACTIVE", nextDueDate } });
          } else if (command === "delete") {
            await tx.recurringExpense.delete({ where: { id: rule.id } });
          }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw new TypeError("Choose a category and bank from this expense group.");
        }
        throw error;
      }
    },
  };
}

export type RecurringExpenseEntry = Awaited<ReturnType<ReturnType<typeof createRecurringExpenseAccess>["list"]>>[number];
