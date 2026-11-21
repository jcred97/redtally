"use client";

import ExpenseFormDialog, { type EditableExpense } from "./ExpenseFormDialog";
import type { ExpenseBankOption } from "@/app/lib/expenses/payment";
import type { CreditProviderOption } from "./CreditProviderField";

export default function EditExpenseButton({
  expenseGroupId,
  expense,
  categories,
  bankOptions,
  creditProviders,
  focusKey,
  inMenu,
}: {
  expenseGroupId: number;
  expense: EditableExpense;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  creditProviders: CreditProviderOption[];
  focusKey: string;
  inMenu: boolean;
}) {
  return (
    <ExpenseFormDialog
      expenseGroupId={expenseGroupId}
      expense={expense}
      categories={categories}
      bankOptions={bankOptions}
      creditProviders={creditProviders}
      focusKey={focusKey}
      inMenu={inMenu}
    />
  );
}
