import AddAccountDialog from "./_components/AddAccountDialog";
import { getFinancialAccountBanks, getFinancialAccounts } from "./_lib/queries";
import { financialAccountTypeLabels } from "./_lib/types";

export default async function AccountsPage() {
  const [accounts, banks] = await Promise.all([getFinancialAccounts(), getFinancialAccountBanks()]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 text-white sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Accounts</h1>
        <AddAccountDialog banks={banks} />
      </header>
      {accounts.length > 0 ? (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map(({ id, name, type, currency, bank }) => (
            <li key={id} className="min-w-0 rounded-xl border border-gray-800 bg-gray-900/45 p-4 sm:p-5">
              <h2 className="wrap-anywhere font-semibold">{name}</h2>
              <p className="mt-1 text-sm text-gray-400">{financialAccountTypeLabels[type]} · {currency}</p>
              {bank && <p className="wrap-anywhere mt-2 text-sm text-gray-300">{bank.name}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl border border-gray-800 bg-gray-900/45 p-4 text-sm text-gray-300 sm:p-5">
          No accounts yet.
        </p>
      )}
    </main>
  );
}
