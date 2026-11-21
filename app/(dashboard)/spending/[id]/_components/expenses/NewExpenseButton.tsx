import { getExpenseGroupPayLater } from "@/app/lib/pay-later/queries";
import ExpenseFormDialog from "./ExpenseFormDialog";
import type { PayLaterProviderOption } from "@/app/lib/pay-later/providers";
import type { ExpenseBankOption } from "@/app/lib/expenses/payment";

export default async function NewExpenseButton({
  expenseGroupId,
  categories,
  bankOptions,
  payLaterProviders,
}: {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  payLaterProviders?: PayLaterProviderOption[];
}) {
  const enabledProviders = payLaterProviders ?? (await getExpenseGroupPayLater(expenseGroupId)).providers.filter(({ active }) => active);

  return (
    <ExpenseFormDialog
      expenseGroupId={expenseGroupId}
      categories={categories}
      bankOptions={bankOptions}
      payLaterProviders={enabledProviders}
    />
  );
}
