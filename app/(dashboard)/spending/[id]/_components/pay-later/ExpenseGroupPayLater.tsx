import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import { creditProducts, spayLaterProduct } from "@/app/lib/loans/credit-products";
import { getCreditAccountSettings } from "@/app/lib/loans/queries";
import GroupCreditAccountCard from "./GroupCreditAccountCard";

export default async function ExpenseGroupPayLater({ expenseGroupId }: { expenseGroupId: number }) {
  const accounts = await getCreditAccountSettings(expenseGroupId);
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <section aria-labelledby="pay-later-title">
      <h2 id="pay-later-title" tabIndex={-1} className="mb-4 text-lg font-semibold">Pay Later</h2>
      <ul className={settingsTileGridClass}>
        {creditProducts.map((product) => (
          <li key={product.key} className="min-w-0">
            <GroupCreditAccountCard
              expenseGroupId={expenseGroupId}
              title={product.provider}
              tileLabel={product.key === spayLaterProduct.key ? product.provider : product.name}
              method={product.name}
              productKey={product.key}
              account={accounts.find((account) => account.key === product.key)}
            />
          </li>
        ))}
        {customAccounts.map((account) => (
          <li key={account.id} className="min-w-0">
            <GroupCreditAccountCard
              expenseGroupId={expenseGroupId}
              title={account.name}
              method="Pay Later"
              account={account}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
