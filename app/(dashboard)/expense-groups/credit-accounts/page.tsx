import LoanPage from "@/app/(dashboard)/loans/_components/LoanPage";
import CreditAccountForm from "./_components/CreditAccountForm";
import CreditAccountsTab from "./_components/CreditAccountsTab";

export default function CreditAccountsPage() {
  return (
    <LoanPage title="Credit Accounts" back={{ href: "/expense-groups", label: "Back to Expense Groups" }} action={<CreditAccountForm />}>
      <div className="mt-5">
        <CreditAccountsTab showHeading={false} />
      </div>
    </LoanPage>
  );
}
