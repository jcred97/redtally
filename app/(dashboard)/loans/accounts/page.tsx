import Link from "next/link";
import { creditProducts } from "@/app/lib/loans/credit-products";
import { getCreditAccounts } from "@/app/lib/loans/queries";
import CreditAccountForm from "../_components/CreditAccountForm";
import CreditProductCard from "../_components/CreditProductCard";
import LoanPage, { loanLink, loanPanel } from "../_components/LoanPage";
import LoanTabs from "../_components/LoanTabs";

export default async function CreditAccountsPage() {
  const accounts = await getCreditAccounts();
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <LoanPage title="Loans">
      <LoanTabs current="accounts" action={<CreditAccountForm />} />
      <div className="mt-5 max-w-xl space-y-4">
        {creditProducts.map((product) => (
          <CreditProductCard key={product.key} product={product} account={accounts.find((account) => account.key === product.key)} />
        ))}
        {customAccounts.length > 0 && (
          <ul aria-label="Custom credit accounts" className={`${loanPanel} divide-y divide-gray-800`}>
            {customAccounts.map(({ id, name }) => (
              <li key={id} className="py-3 first:pt-0 last:pb-0">
                <Link href={`/loans/accounts/${id}`} className={`${loanLink} wrap-anywhere`}>{name}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </LoanPage>
  );
}
