import type { Prisma } from "@/generated/prisma/client";
import { parseExpenseDate } from "@/app/lib/expenses/date";
import type { calculateSPayLaterSchedule } from "@/app/lib/pay-later/schedule";

function billingPeriodKey({ periodStart, periodEnd }: { periodStart: Date; periodEnd: Date }) {
  return `${periodStart.getTime()}/${periodEnd.getTime()}`;
}

export async function saveExpenseInstallments(
  tx: Prisma.TransactionClient,
  expenseGroupId: number,
  expenseId: number,
  dueDay: number,
  schedule: NonNullable<ReturnType<typeof calculateSPayLaterSchedule>>,
): Promise<void> {
  const entries = schedule.map(({ periodStart, periodEnd, statementDate, dueDate, installmentNumber, amountCentavos }) => ({
    bill: {
      expenseGroupId,
      dueDay,
      periodStart: parseExpenseDate(periodStart),
      periodEnd: parseExpenseDate(periodEnd),
      statementDate: parseExpenseDate(statementDate),
      dueDate: parseExpenseDate(dueDate),
    },
    installmentNumber,
    amountCentavos,
  }));

  await tx.billing.createMany({ data: entries.map(({ bill }) => bill), skipDuplicates: true });
  const bills = await tx.billing.findMany({
    where: {
      expenseGroupId,
      dueDay,
      OR: entries.map(({ bill: { periodStart, periodEnd } }) => ({ periodStart, periodEnd })),
    },
    select: { id: true, periodStart: true, periodEnd: true },
  });
  const idsByPeriod = new Map(bills.map((bill) => [billingPeriodKey(bill), bill.id]));
  await tx.billingInstallment.createMany({
    data: entries.map(({ bill, installmentNumber, amountCentavos }) => {
      const billingId = idsByPeriod.get(billingPeriodKey(bill));
      if (billingId === undefined) throw new Error("Could not resolve the billing period.");
      return { expenseGroupId, billingId, expenseId, installmentNumber, amountCentavos };
    }),
  });
}

export async function getExpenseBillingIds(
  tx: Prisma.TransactionClient,
  expenseGroupId: number,
  expenseId: number,
): Promise<number[]> {
  const installments = await tx.billingInstallment.findMany({
    where: { expenseGroupId, expenseId },
    select: { billingId: true },
  });
  return installments.map(({ billingId }) => billingId);
}

export async function deleteEmptyBills(
  tx: Prisma.TransactionClient,
  expenseGroupId: number,
  billingIds: number[],
): Promise<void> {
  if (billingIds.length === 0) return;
  await tx.billing.deleteMany({
    where: { expenseGroupId, id: { in: billingIds }, installments: { none: {} } },
  });
}
