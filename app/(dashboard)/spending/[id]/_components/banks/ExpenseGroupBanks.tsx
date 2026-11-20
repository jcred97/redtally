import type { BankCatalogEntry } from "@/app/(dashboard)/_lib/banks/access";
import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import BankSettingsDialog from "./BankSettingsDialog";

export default function ExpenseGroupBanks({
  expenseGroupId,
  banks,
}: {
  expenseGroupId: number;
  banks: BankCatalogEntry[];
}) {
  return (
    <section aria-labelledby="banks-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="banks-title" className="text-lg font-semibold">Banks</h2>
        <a href="#pay-later-title" className="rounded-sm text-sm text-red-300 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400">
          Jump to Pay Later
        </a>
      </div>
      {banks.length === 0 ? (
        <p className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-400">
          No banks are available.
        </p>
      ) : (
        <ul className={settingsTileGridClass}>
          {banks.map((bank) => (
            <li key={bank.id} className="min-w-0">
              <BankSettingsDialog expenseGroupId={expenseGroupId} bank={bank} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
