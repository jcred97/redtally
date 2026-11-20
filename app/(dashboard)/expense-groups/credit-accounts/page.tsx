import LoanPage from "@/app/(dashboard)/loans/_components/LoanPage";
import { getCreditAccounts } from "@/app/lib/loans/queries";
import CreditAccountForm from "./_components/CreditAccountForm";
import CreditAccountTiles from "./_components/CreditAccountTiles";
import PayLaterSummary from "./_components/PayLaterSummary";

export default async function CreditAccountsPage() {
  const accounts = await getCreditAccounts();

  return (
    <LoanPage title="Credit Accounts" back={{ href: "/expense-groups", label: "Back to Expense Groups" }} action={<CreditAccountForm />}>
      <div className="mt-5 space-y-6">
        <section aria-label="Credit accounts">
          <CreditAccountTiles accounts={accounts} standalone />
        </section>
        <PayLaterSummary accounts={accounts} />
      </div>
    </LoanPage>
  );
}
