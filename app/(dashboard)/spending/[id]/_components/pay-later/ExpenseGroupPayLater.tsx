import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import { creditProducts, spayLaterProduct } from "@/app/lib/loans/credit-products";
import { getCreditAccountSettings, getGroupSPayLaterPurchases } from "@/app/lib/loans/queries";
import GroupCreditAccountCard from "./GroupCreditAccountCard";
import SPayLaterPurchases from "./SPayLaterPurchases";

export default async function ExpenseGroupPayLater({ expenseGroupId }: { expenseGroupId: number }) {
  const [accounts, purchases] = await Promise.all([
    getCreditAccountSettings(expenseGroupId),
    getGroupSPayLaterPurchases(expenseGroupId),
  ]);
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <div className="space-y-8">
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
      <SPayLaterPurchases purchases={purchases} />
    </div>
  );
}
