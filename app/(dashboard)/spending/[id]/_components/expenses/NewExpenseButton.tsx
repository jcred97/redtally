import { getExpenseGroupPayLater } from "@/app/lib/pay-later/queries";
import ExpenseFormDialog, { type CreditProviderOption } from "./ExpenseFormDialog";
import type { ExpenseBankOption } from "@/app/lib/expenses/payment";

export default async function NewExpenseButton({
  expenseGroupId,
  categories,
  bankOptions,
  creditProviders,
}: {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  creditProviders?: CreditProviderOption[];
}) {
  const enabledProviders = creditProviders ?? (await getExpenseGroupPayLater(expenseGroupId)).providers.filter(({ active }) => active);

  return (
    <ExpenseFormDialog
      expenseGroupId={expenseGroupId}
      categories={categories}
      bankOptions={bankOptions}
      creditProviders={enabledProviders}
    />
  );
}
