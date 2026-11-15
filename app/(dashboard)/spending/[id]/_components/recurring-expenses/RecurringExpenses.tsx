import Link from "next/link";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";
import { recurrenceFrequencyLabels } from "@/app/lib/expenses/recurrence";
import type { RecurringExpenseEntry } from "@/app/(dashboard)/_lib/recurring-expenses/access";
import RecurringExpenseActions from "./RecurringExpenseActions";
import RecurringExpenseDialog, { type RecurringExpenseOptions } from "./RecurringExpenseDialog";
import RunRecurringExpensesButton from "./RunRecurringExpensesButton";

const statusLabels = { ACTIVE: "Active", PAUSED: "Paused", NEEDS_ATTENTION: "Needs attention" };

export default function RecurringExpenses({ rules, ...options }: RecurringExpenseOptions & { rules: RecurringExpenseEntry[] }) {
  return (
    <section aria-labelledby="recurring-expenses-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 id="recurring-expenses-title" tabIndex={-1} className="text-lg font-semibold">Recurring expenses</h2>
        <div className="flex flex-wrap items-start gap-2">
          {rules.length > 0 && <RunRecurringExpensesButton expenseGroupId={options.expenseGroupId} />}
          {options.categories.length > 0 && <RecurringExpenseDialog {...options} />}
        </div>
      </div>
      {rules.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-400">
          {options.categories.length > 0 ? "No recurring expenses yet." : (
            <Link href={`/spending/${options.expenseGroupId}?tab=categories`} className="text-red-300 underline underline-offset-4">
              Add a category to create a recurring expense.
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rules.map((rule) => {
            const completed = rule.endDate !== null && rule.nextDueDate > rule.endDate;
            const payment = rule.paymentMethod ? paymentMethodLabels[rule.paymentMethod] : null;
            return (
              <li key={rule.id} className="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="min-w-0 wrap-anywhere font-semibold">{rule.title}</h3>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPesoAmount(rule.amountCentavos)}</p>
                </div>
                <p className="mt-1 wrap-anywhere text-sm text-gray-400">
                  {[recurrenceFrequencyLabels[rule.frequency], rule.category.name, payment, rule.bankAssignment?.bank.name]
                    .filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  {completed ? "Completed" : statusLabels[rule.status]}
                  {!completed && <> · {rule.status === "ACTIVE" ? "Next due" : "Next unposted"} {formatExpenseDate(rule.nextDueDate)}</>}
                </p>
                {rule.status === "NEEDS_ATTENTION" && !completed && (
                  <p className="mt-1 text-sm text-red-300">Check the bank and payment method, then resume this schedule.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <RecurringExpenseDialog {...options} rule={rule} />
                  <RecurringExpenseActions rule={rule} today={options.today} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
