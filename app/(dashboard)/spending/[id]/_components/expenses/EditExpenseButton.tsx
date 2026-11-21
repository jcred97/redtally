"use client";

import ExpenseFormDialog, { type EditableExpense } from "./ExpenseFormDialog";
import type { PayLaterProviderOption } from "@/app/lib/pay-later/providers";
import type { ExpenseBankOption } from "@/app/lib/expenses/payment";

export default function EditExpenseButton({
  expenseGroupId,
  expense,
  categories,
  bankOptions,
  payLaterProviders,
  focusKey,
  inMenu,
}: {
  expenseGroupId: number;
  expense: EditableExpense;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  payLaterProviders: PayLaterProviderOption[];
  focusKey: string;
  inMenu: boolean;
}) {
  return (
    <ExpenseFormDialog
      expenseGroupId={expenseGroupId}
      expense={expense}
      categories={categories}
      bankOptions={bankOptions}
      payLaterProviders={payLaterProviders}
      focusKey={focusKey}
      inMenu={inMenu}
    />
  );
}
