import Link from "next/link";
import SettingsTileLabel, { settingsTileClass, settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import { creditAccountHref } from "@/app/lib/loans/credit-account-links";
import { creditProducts } from "@/app/lib/loans/credit-products";
import CreditProductCard from "./CreditProductCard";

export default function CreditAccountTiles({ accounts, standalone = false }: {
  accounts: { id: string; name: string; key: string; enabled: boolean }[];
  standalone?: boolean;
}) {
  const customAccounts = accounts.filter((account) => !creditProducts.some((product) => product.key === account.key));

  return (
    <ul className={settingsTileGridClass}>
      {creditProducts.map((product) => {
        const account = accounts.find((candidate) => candidate.key === product.key);
        return (
          <li key={product.key} className="min-w-0">
            <CreditProductCard product={product} account={account && { id: account.id, enabled: account.enabled }} standalone={standalone} />
          </li>
        );
      })}
      {customAccounts.map(({ id, name, enabled }) => (
        <li key={id} className="min-w-0">
          <Link href={creditAccountHref(id)} className={settingsTileClass}>
            <SettingsTileLabel
              name={name}
              status={standalone ? undefined : enabled ? "Enabled" : "Not enabled"}
              enabled={enabled}
              icon={(
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-700 text-xs font-semibold uppercase text-gray-100">
                  {Array.from(name)[0]}
                </span>
              )}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
