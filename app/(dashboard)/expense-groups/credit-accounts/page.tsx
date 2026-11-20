import Link from "next/link";
import { creditAccountHref } from "@/app/lib/loans/credit-account-links";
import { creditProducts } from "@/app/lib/loans/credit-products";
import { getCreditAccounts } from "@/app/lib/loans/queries";
import LoanPage from "@/app/(dashboard)/loans/_components/LoanPage";
import CreditAccountForm from "./_components/CreditAccountForm";
import CreditProductCard from "./_components/CreditProductCard";
import PayLaterSummary from "./_components/PayLaterSummary";

export default async function CreditAccountsPage() {
  const accounts = await getCreditAccounts();
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <LoanPage title="Credit Accounts" back={{ href: "/expense-groups", label: "Back to Expense Groups" }} action={<CreditAccountForm />}>
      <div className="mt-5 space-y-6">
        <ul aria-label="Credit accounts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {creditProducts.map((product) => {
            const account = accounts.find((candidate) => candidate.key === product.key);
            return (
              <li key={product.key} className="min-w-0">
                <CreditProductCard product={product} account={account && { id: account.id, enabled: account.enabled }} />
              </li>
            );
          })}
          {customAccounts.map(({ id, name }) => (
            <li key={id} className="min-w-0">
              <Link
                href={creditAccountHref(id)}
                className="flex h-full w-full items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-left text-sm transition-colors hover:border-gray-600 hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
              >
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-700 text-xs font-semibold uppercase text-gray-100">
                  {Array.from(name)[0]}
                </span>
                <span className="min-w-0 wrap-anywhere font-medium">{name}</span>
              </Link>
            </li>
          ))}
        </ul>
        <PayLaterSummary accounts={accounts} />
      </div>
    </LoanPage>
  );
}
