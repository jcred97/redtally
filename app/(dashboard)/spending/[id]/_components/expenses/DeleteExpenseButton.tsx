"use client";

import FormDialog from "@/app/components/dialogs/FormDialog";
import menuStyles from "@/app/components/menus/action-menu.module.css";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { deleteExpense } from "@/app/(dashboard)/_lib/expenses/mutations";

export default function DeleteExpenseButton({
  expenseGroupId,
  expense,
  menuFocusKey,
}: {
  expenseGroupId: number;
  expense: { id: number; title: string; amountCentavos: number };
  menuFocusKey?: string;
}) {
  async function confirmDelete(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    formData.set("expenseId", String(expense.id));
    return deleteExpense(null, formData);
  }

  return (
    <FormDialog
      triggerLabel="Delete"
      triggerAriaLabel={`Delete expense: ${expense.title}`}
      triggerFocusKey={menuFocusKey ?? `delete-expense-${expense.id}`}
      triggerVariant="danger"
      triggerClassName={menuFocusKey ? `${menuStyles.item} w-full cursor-pointer px-3 py-2 text-left text-sm text-red-400` : undefined}
      destructive
      returnFocusId="expense-group-title"
      title="Delete expense?"
      description="This permanently removes the expense and updates your totals. This cannot be undone."
      onOpenAction={() => {}}
      submitLabel="Delete expense"
      pendingLabel="Deleting..."
      pendingMessage="Deleting expense..."
      failureMessage="Unable to delete the expense. Please try again."
      submitAction={confirmDelete}
    >
      <p className="break-words font-medium">{expense.title}</p>
      <p className="text-red-400">{formatPesoAmount(expense.amountCentavos)}</p>
    </FormDialog>
  );
}
