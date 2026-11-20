import { getCreditAccountSettings } from "@/app/lib/loans/queries";
import CreditAccountTiles from "./CreditAccountTiles";

export default async function CreditAccountsTab() {
  const accounts = await getCreditAccountSettings();

  return (
    <section aria-labelledby="credit-accounts-title">
      <h2 id="credit-accounts-title" className="mb-4 text-lg font-semibold">Credit Accounts</h2>
      <CreditAccountTiles accounts={accounts} />
    </section>
  );
}
