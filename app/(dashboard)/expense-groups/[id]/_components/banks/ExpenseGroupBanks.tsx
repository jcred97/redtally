import type { BankCatalogEntry } from "@/app/(dashboard)/_lib/banks/access";
import ExpenseGroupEmptyState from "../ExpenseGroupEmptyState";
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
      <h2 id="banks-title" className="mb-4 text-lg font-semibold">Banks</h2>
      {banks.length === 0 ? (
        <ExpenseGroupEmptyState icon="🏦" title="No banks available" />
      ) : (
        <ul className="expense-group-card-grid">
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
