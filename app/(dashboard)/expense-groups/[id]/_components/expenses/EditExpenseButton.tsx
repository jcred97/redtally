"use client";

import ExpenseFormDialog from "./ExpenseFormDialog";
import type { EditableExpense } from "../../_lib/expenses/editable";
import type { PayLaterProviderOption } from "@/app/lib/pay-later/providers";
import type { BankAssignmentOption } from "@/app/lib/expenses/payment";

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
  bankOptions: BankAssignmentOption[];
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
