import Link from "next/link";
import { getCreditAccounts } from "@/app/lib/loans/queries";
import CreditAccountForm from "../_components/CreditAccountForm";
import LoanPage, { loanLink, loanPanel } from "../_components/LoanPage";
import LoanTabs from "../_components/LoanTabs";

export default async function CreditAccountsPage() {
  const accounts = await getCreditAccounts();

  return (
    <LoanPage title="Loans">
      <LoanTabs current="accounts" />
      <div className="mt-5 max-w-xl space-y-4">
        <CreditAccountForm />
        {accounts.length ? (
          <ul aria-label="Credit accounts" className={`${loanPanel} divide-y divide-gray-800`}>
            {accounts.map(({ id, name }) => (
              <li key={id} className="py-3 first:pt-0 last:pb-0">
                <Link href={`/loans/accounts/${id}`} className={`${loanLink} wrap-anywhere`}>{name}</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-400">No credit accounts yet. Add one here or while recording a Pay Later purchase.</p>}
      </div>
    </LoanPage>
  );
}
