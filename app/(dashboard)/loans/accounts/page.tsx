import Link from "next/link";
import { creditProducts } from "@/app/lib/loans/credit-products";
import { getCreditAccounts } from "@/app/lib/loans/queries";
import CreditAccountForm from "../_components/CreditAccountForm";
import CreditProductCard from "../_components/CreditProductCard";
import LoanPage from "../_components/LoanPage";
import LoanTabs from "../_components/LoanTabs";

export default async function CreditAccountsPage() {
  const accounts = await getCreditAccounts();
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <LoanPage title="Loans">
      <LoanTabs current="accounts" action={<CreditAccountForm />} />
      <section aria-labelledby="credit-accounts-title" className="mt-6 sm:mt-8">
        <h2 id="credit-accounts-title" className="mb-4 text-lg font-semibold">Credit Accounts</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {creditProducts.map((product) => (
            <li key={product.key} className="min-w-0">
              <CreditProductCard product={product} account={accounts.find((account) => account.key === product.key)} />
            </li>
          ))}
          {customAccounts.map(({ id, name }) => (
            <li key={id} className="min-w-0">
              <Link
                href={`/loans/accounts/${id}`}
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
    </LoanPage>
  );
}
