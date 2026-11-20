import Link from "next/link";
import SettingsTileLabel, { settingsTileClass, settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import { creditAccountHref } from "@/app/lib/loans/credit-account-links";
import { creditProducts } from "@/app/lib/loans/credit-products";
import CreditProductCard from "./CreditProductCard";
import GroupCreditAccountCard, { type GroupCreditAccount } from "./GroupCreditAccountCard";

export default function CreditAccountTiles({ accounts, expenseGroupId }: {
  accounts: (GroupCreditAccount & { name: string; key: string })[];
  expenseGroupId?: number;
}) {
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <ul className={settingsTileGridClass}>
      {creditProducts.map((product) => {
        const account = accounts.find((candidate) => candidate.key === product.key);
        return (
          <li key={product.key} className="min-w-0">
            {expenseGroupId === undefined ? (
              <CreditProductCard product={product} account={account && { id: account.id, enabled: account.enabled }} />
            ) : (
              <GroupCreditAccountCard
                expenseGroupId={expenseGroupId}
                title={`${product.provider} · ${product.name}`}
                initials={product.provider.slice(0, 2)}
                method={product.name}
                productKey={product.key}
                account={account}
              />
            )}
          </li>
        );
      })}
      {customAccounts.map((account) => (
        <li key={account.id} className="min-w-0">
          {expenseGroupId === undefined ? (
            <Link href={creditAccountHref(account.id)} className={settingsTileClass}>
              <SettingsTileLabel
                name={account.name}
                icon={(
                  <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-700 text-xs font-semibold uppercase text-gray-100">
                    {Array.from(account.name)[0]}
                  </span>
                )}
              />
            </Link>
          ) : (
            <GroupCreditAccountCard
              expenseGroupId={expenseGroupId}
              title={account.name}
              initials={Array.from(account.name)[0] ?? ""}
              method="Pay Later"
              account={account}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
