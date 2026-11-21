import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";
import { getExpenseGroupPayLater } from "@/app/lib/loans/queries";
import GroupCreditProviderCard from "./GroupCreditProviderCard";

export default async function ExpenseGroupPayLater({ expenseGroupId }: { expenseGroupId: number }) {
  const { providers } = await getExpenseGroupPayLater(expenseGroupId);

  return (
    <section aria-labelledby="pay-later-title">
      <h2 id="pay-later-title" tabIndex={-1} className="mb-4 text-lg font-semibold">Pay Later</h2>
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
