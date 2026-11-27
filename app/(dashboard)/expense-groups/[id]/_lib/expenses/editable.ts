import type { Prisma } from "@/generated/prisma/client";

export const editableExpenseSelect = {
  id: true, title: true, merchant: true, amountCentavos: true,
  date: true, timeMinutes: true, updatedAt: true, categoryId: true, paymentMethod: true,
  bankAssignmentId: true, legacyBankName: true, bankAssignment: { select: { bank: { select: { name: true } } } },
  payLaterProviderKey: true, payLaterProviderName: true,
  spayLaterDueDay: true, spayLaterMonths: true, spayLaterCompletedOn: true,
} satisfies Prisma.ExpenseSelect;

type ExpenseForEditing = Prisma.ExpenseGetPayload<{ select: typeof editableExpenseSelect }>;

export function toEditableExpense(expense: ExpenseForEditing) {
  const { bankAssignment, legacyBankName, date, updatedAt, spayLaterCompletedOn } = expense;
  return {
    id: expense.id,
    title: expense.title,
    merchant: expense.merchant,
    amountCentavos: expense.amountCentavos,
    date: date.toISOString(),
    timeMinutes: expense.timeMinutes,
    updatedAt: updatedAt.toISOString(),
    categoryId: expense.categoryId,
    paymentMethod: expense.paymentMethod,
    bankAssignmentId: expense.bankAssignmentId,
    bankName: bankAssignment?.bank.name ?? legacyBankName,
    payLaterProviderKey: expense.payLaterProviderKey,
    payLaterProviderName: expense.payLaterProviderName,
    spayLaterDueDay: expense.spayLaterDueDay,
    spayLaterMonths: expense.spayLaterMonths,
    spayLaterCompletedOn: spayLaterCompletedOn?.toISOString().slice(0, 10) ?? null,
  };
}

export type EditableExpense = ReturnType<typeof toEditableExpense>;
