import { getExpenseGroupPayLater } from "@/app/lib/loans/queries";
import ExpenseFormDialog from "./ExpenseFormDialog";
import type { ExpenseBankOption } from "@/app/lib/expenses/payment";

export default async function NewExpenseButton({
  expenseGroupId,
  categories,
  bankOptions,
}: {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
}) {
  const { providers, accounts } = await getExpenseGroupPayLater(expenseGroupId);

  return (
    <ExpenseFormDialog expenseGroupId={expenseGroupId} categories={categories} bankOptions={bankOptions}
      creditProviders={providers.filter(({ active }) => active)} creditAccounts={accounts} />
  );
}
