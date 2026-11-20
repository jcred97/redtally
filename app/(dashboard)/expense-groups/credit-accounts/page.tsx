import LoanPage from "@/app/(dashboard)/loans/_components/LoanPage";
import { getCreditAccounts } from "@/app/lib/loans/queries";
import CreditAccountForm from "./_components/CreditAccountForm";
import CreditAccountTiles from "./_components/CreditAccountTiles";
import PayLaterSummary from "./_components/PayLaterSummary";

export default async function PayLaterBillsPage() {
  const accounts = await getCreditAccounts();

  return (
    <LoanPage title="Pay Later Bills" back={{ href: "/expense-groups", label: "Back to Expense Groups" }}>
      <div className="mt-5 space-y-6">
        <PayLaterSummary accounts={accounts} />
        <section aria-labelledby="accounts-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="accounts-title" className="text-lg font-semibold">Accounts</h2>
            <CreditAccountForm />
          </div>
          <CreditAccountTiles accounts={accounts} />
        </section>
      </div>
    </LoanPage>
  );
}
