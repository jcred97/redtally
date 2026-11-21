import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import { getExpenseGroupPayLater } from "@/app/lib/pay-later/queries";
import AddCreditProviderButton from "./AddCreditProviderButton";
import GroupCreditProviderCard from "./GroupCreditProviderCard";

export default async function ExpenseGroupPayLater({ expenseGroupId }: { expenseGroupId: number }) {
  const { providers } = await getExpenseGroupPayLater(expenseGroupId);

  return (
    <section aria-labelledby="pay-later-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="pay-later-title" tabIndex={-1} className="text-lg font-semibold">Pay Later</h2>
        <AddCreditProviderButton expenseGroupId={expenseGroupId} />
      </div>
      <ul className={settingsTileGridClass}>
        {providers.map((provider) => (
          <li key={provider.key} className="min-w-0">
            <GroupCreditProviderCard expenseGroupId={expenseGroupId} provider={provider} />
          </li>
        ))}
      </ul>
    </section>
  );
}
