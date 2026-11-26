import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";
import { recurrenceFrequencyLabels } from "@/app/lib/expenses/recurrence";
import type { RecurringExpenseEntry } from "@/app/(dashboard)/_lib/recurring-expenses/access";
import { recurringExpenseAnchor } from "../../_lib/navigation";
import ExpenseGroupEmptyState from "../ExpenseGroupEmptyState";
import RecurringExpenseActions from "./RecurringExpenseActions";
import RecurringExpenseDialog, { type RecurringExpenseOptions } from "./RecurringExpenseDialog";
import RunRecurringExpensesButton from "./RunRecurringExpensesButton";

const statusLabels = { ACTIVE: "Active", PAUSED: "Paused", NEEDS_ATTENTION: "Needs attention" };

export default function RecurringExpenses({ rules, categoriesHref, ...options }: RecurringExpenseOptions & { rules: RecurringExpenseEntry[]; categoriesHref: string }) {
  const hasCategories = options.categories.length > 0;

  return (
    <section aria-labelledby="recurring-expenses-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 id="recurring-expenses-title" tabIndex={-1} className="text-lg font-semibold">Recurring expenses</h2>
        {rules.length > 0 && <RunRecurringExpensesButton expenseGroupId={options.expenseGroupId} />}
      </div>
      {rules.length === 0 ? (
        <ExpenseGroupEmptyState
          icon="🔁"
          title="No recurring expenses yet"
          action={hasCategories ? undefined : { href: categoriesHref, label: "Go to Categories" }}
        >
          <p className="mt-1 text-sm text-gray-400">
            {hasCategories ? (
              <>Select <strong className="font-medium text-gray-300">+ New Recurring Expense</strong> to create your first schedule.</>
            ) : "Add a category to create a recurring expense."}
          </p>
        </ExpenseGroupEmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 [&>li:only-child]:col-span-full">
          {rules.map((rule) => {
            const completed = rule.endDate !== null && rule.nextDueDate > rule.endDate;
            const payment = rule.paymentMethod ? paymentMethodLabels[rule.paymentMethod] : null;
            return (
              <li
                key={rule.id}
                id={recurringExpenseAnchor(rule.id)}
                tabIndex={-1}
                className="min-w-0 scroll-mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4 target:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
              >
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
