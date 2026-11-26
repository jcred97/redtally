import { getExpenseGroupPayLater } from "@/app/lib/pay-later/queries";
import { getPayLaterProviderDisplayName } from "@/app/lib/pay-later/providers";
import ExpenseGroupEmptyState from "../ExpenseGroupEmptyState";
import PayLaterProviderCard from "./PayLaterProviderCard";

export default async function ExpenseGroupPayLater({ expenseGroupId }: { expenseGroupId: number }) {
  const { providers } = await getExpenseGroupPayLater(expenseGroupId);
  const sortedProviders = providers.toSorted((left, right) =>
    getPayLaterProviderDisplayName(left).localeCompare(getPayLaterProviderDisplayName(right), "en", { sensitivity: "base" }),
  );

  return (
    <section aria-labelledby="pay-later-title">
      <h2 id="pay-later-title" tabIndex={-1} className="mb-4 text-lg font-semibold">Pay Later</h2>
      {sortedProviders.length === 0 ? (
        <ExpenseGroupEmptyState icon="💳" title="No Pay Later providers available" />
      ) : (
        <ul className="expense-group-card-grid">
          {sortedProviders.map((provider) => (
            <li key={provider.providerKey} className="min-w-0">
              <PayLaterProviderCard expenseGroupId={expenseGroupId} provider={provider} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
