import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getManilaToday, parseExpenseDate } from "@/app/lib/expenses/date";
import { getRecurringDateOnOrAfter, recurrenceFrequencies, type RecurrenceFrequency } from "@/app/lib/expenses/recurrence";
import { parseExpenseInput, parsePaymentSelection, validateBankSelection } from "../expenses/access";

const NOT_FOUND = "Recurring expense not found in this expense group.";

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
  return {
    categoryId, title, amountCentavos, frequency, startDate, endDate,
    paymentMethod: payment?.paymentMethod ?? null,
    bankAssignmentId: payment?.bankAssignmentId ?? null,
  };
}

export function createRecurringExpenseAccess(
  db: PrismaClient,
  requireUserId: () => Promise<string>,
  today: () => Date = () => parseExpenseDate(getManilaToday()),
) {
  return {
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
            const [group] = await tx.$queryRaw<{ id: number }[]>`
              SELECT id FROM "Spending" WHERE id = ${expenseGroupId} AND "userId" = ${userId} FOR SHARE
            `;
            if (!group) throw new TypeError(NOT_FOUND);
            await validateBankSelection(tx, expenseGroupId, values);
            await tx.recurringExpense.create({ data: { ...values, expenseGroupId, nextDueDate: values.startDate } });
            return;
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
