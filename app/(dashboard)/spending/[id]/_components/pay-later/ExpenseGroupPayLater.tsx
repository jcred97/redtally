import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import { getExpenseGroupPayLater } from "@/app/lib/pay-later/queries";
import AddPayLaterProviderButton from "./AddPayLaterProviderButton";
import PayLaterProviderCard from "./PayLaterProviderCard";

export default async function ExpenseGroupPayLater({ expenseGroupId }: { expenseGroupId: number }) {
  const { providers } = await getExpenseGroupPayLater(expenseGroupId);

  return (
    <section aria-labelledby="pay-later-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="pay-later-title" tabIndex={-1} className="text-lg font-semibold">Pay Later</h2>
        <AddPayLaterProviderButton expenseGroupId={expenseGroupId} />
      </div>
      <ul className={settingsTileGridClass}>
        {providers.map((provider) => (
          <li key={provider.providerKey} className="min-w-0">
            <PayLaterProviderCard expenseGroupId={expenseGroupId} provider={provider} />
          </li>
        ))}
      </ul>
    </section>
  );
}
