import { Prisma, type PrismaClient, type RecurringExpense } from "@/generated/prisma/client";
import { getNextRecurringDate } from "@/app/lib/expenses/recurrence";
import { BankSelectionError, validateBankSelection } from "../expenses/access";

const BATCH_SIZE = 50;

// runDate is the Manila calendar day encoded at UTC midnight, like an expense date.
export async function runRecurringExpenses(
  db: PrismaClient,
  runDate: Date,
  limit = BATCH_SIZE,
  shouldContinue: () => boolean = () => true,
) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("The recurring expense batch size must be a positive integer.");
  }

  const dueRules = Prisma.sql`
    FROM "RecurringExpense" AS rule
    JOIN "Spending" AS expense_group ON expense_group."id" = rule."expenseGroupId"
    WHERE rule."status" = 'ACTIVE' AND expense_group."userId" IS NOT NULL
      AND rule."nextDueDate" <= ${runDate.toISOString().slice(0, 10)}::date
      AND (rule."endDate" IS NULL OR rule."nextDueDate" <= rule."endDate")
  `;
  const counts = { generated: 0, needsAttention: 0, alreadyRecorded: 0 };

  for (let attempt = 0; attempt < limit && shouldContinue(); attempt++) {
    const result = await db.$transaction(async (tx) => {
      // A shared group lock keeps the rule's ownership stable during the write.
      const [rule] = await tx.$queryRaw<RecurringExpense[]>`
        SELECT rule.* ${dueRules}
        ORDER BY rule."nextDueDate", rule."id"
        LIMIT 1
        FOR UPDATE OF rule SKIP LOCKED
        FOR SHARE OF expense_group
      `;
      if (!rule) return;

      const dueDate = rule.nextDueDate;
      const nextDueDate = getNextRecurringDate(dueDate, rule.frequency, rule.startDate);
      const occurrence = { recurringExpenseId: rule.id, dueDate };
      const recorded = await tx.recurringExpenseOccurrence.findUnique({
        where: { recurringExpenseId_dueDate: occurrence },
        select: { recurringExpenseId: true },
      });

      if (!recorded) {
        try {
          await validateBankSelection(tx, rule.expenseGroupId, rule);
        } catch (error) {
          if (!(error instanceof BankSelectionError)) throw error;
          await tx.recurringExpense.update({ where: { id: rule.id }, data: { status: "NEEDS_ATTENTION" } });
          return "needsAttention";
        }

        const expense = await tx.expense.create({
          data: {
            title: rule.title,
            amountCentavos: rule.amountCentavos,
            date: dueDate,
            expenseGroupId: rule.expenseGroupId,
            categoryId: rule.categoryId,
            paymentMethod: rule.paymentMethod,
            bankAssignmentId: rule.bankAssignmentId,
          },
          select: { id: true },
        });
        await tx.recurringExpenseOccurrence.create({ data: { ...occurrence, expenseId: expense.id } });
      }

      await tx.recurringExpense.update({ where: { id: rule.id }, data: { nextDueDate } });
      return recorded ? "alreadyRecorded" : "generated";
    });
    if (!result) break;
    counts[result]++;
  }

  const [remaining] = await db.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 ${dueRules})
  `;
  return { ...counts, hasCatchUpRemaining: remaining.exists };
}

export async function drainRecurringExpenses(
  db: PrismaClient,
  runDate: Date,
  shouldContinue: () => boolean,
) {
  const totals = { generated: 0, needsAttention: 0, alreadyRecorded: 0 };

  while (true) {
    const batch = await runRecurringExpenses(db, runDate, BATCH_SIZE, shouldContinue);
    totals.generated += batch.generated;
    totals.needsAttention += batch.needsAttention;
    totals.alreadyRecorded += batch.alreadyRecorded;

    const processed = batch.generated + batch.needsAttention + batch.alreadyRecorded;
    // An incomplete batch can mean the remaining rows are locked or time ran out.
    if (!batch.hasCatchUpRemaining || processed < BATCH_SIZE || !shouldContinue()) {
      return { ...totals, hasCatchUpRemaining: batch.hasCatchUpRemaining };
    }
  }
}
