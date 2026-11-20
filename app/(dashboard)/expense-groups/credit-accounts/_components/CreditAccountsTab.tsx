import Link from "next/link";
import { creditAccountHref } from "@/app/lib/loans/credit-account-links";
import { creditProducts } from "@/app/lib/loans/credit-products";
import { getCreditAccounts } from "@/app/lib/loans/queries";
import CreditAccountForm from "./CreditAccountForm";
import CreditProductCard from "./CreditProductCard";
import PayLaterSummary from "./PayLaterSummary";

export default async function CreditAccountsTab({ showHeading = true }: { showHeading?: boolean }) {
  const accounts = await getCreditAccounts();
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <div className="space-y-6">
      <section aria-labelledby={showHeading ? "credit-accounts-title" : undefined} aria-label={showHeading ? undefined : "Credit accounts"}>
        {showHeading && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="credit-accounts-title" className="text-lg font-semibold">Credit Accounts</h2>
            <CreditAccountForm />
          </div>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>
      <PayLaterSummary accounts={accounts} />
    </div>
  );
}
