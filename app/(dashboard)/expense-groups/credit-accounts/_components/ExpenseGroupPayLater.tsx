import { getCreditAccountSettings } from "@/app/lib/loans/queries";
import CreditAccountTiles from "./CreditAccountTiles";

export default async function ExpenseGroupPayLater({ expenseGroupId }: { expenseGroupId: number }) {
  const accounts = await getCreditAccountSettings(expenseGroupId);

  return (
    <section aria-labelledby="pay-later-title">
      <h2 id="pay-later-title" tabIndex={-1} className="mb-4 text-lg font-semibold">Pay Later</h2>
      <CreditAccountTiles accounts={accounts} expenseGroupId={expenseGroupId} />
    </section>
  );
}
