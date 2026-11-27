import { createHash } from "node:crypto";
import Link from "next/link";
import type { ComponentProps } from "react";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import type { ExpenseHistoryAvailability } from "@/app/(dashboard)/_lib/expense-groups/access";
import type { ExpenseHistoryEntry, getExpensePageByExpenseGroupId } from "@/app/(dashboard)/_lib/expense-groups/queries";
import type { ExpenseGroupLinks, ExpenseGroupView } from "../../_lib/navigation";
import ExpenseGroupEmptyState from "../ExpenseGroupEmptyState";
import ExpenseHistory from "./ExpenseHistory";
import ExpenseHistoryFilters from "./ExpenseHistoryFilters";
import ExportExpensesButton from "./ExportExpensesButton";
import ImportExpensesButton from "./ImportExpensesButton";

type ExpensesTabProps = {
  expenseGroupId: number;
  categories: ComponentProps<typeof ExpenseHistory>["categories"];
  bankOptions: ComponentProps<typeof ExpenseHistory>["bankOptions"];
  payLaterProviders: ComponentProps<typeof ExpenseHistory>["payLaterProviders"];
  historyProviderOptions: ComponentProps<typeof ExpenseHistoryFilters>["providers"];
  merchantLabel?: string;
  expensePage: NonNullable<Awaited<ReturnType<typeof getExpensePageByExpenseGroupId>>>;
  historyAvailability?: ExpenseHistoryAvailability;
  view: ExpenseGroupView;
  links: ExpenseGroupLinks;
};

function selectedExpenseFilterQuery(expense: ExpenseHistoryEntry, grouped: boolean) {
  const params = new URLSearchParams({
    expense: String(expense.id),
    search: expense.title,
    day: expense.date.toISOString().slice(0, 10),
    category: String(expense.categoryId),
  });
  if (expense.paymentMethod) params.set("paymentMethod", expense.paymentMethod);
  // Match the SHA-256 values used by the history provider options.
  if (expense.paymentMethod === "PAY_LATER") {
    if (expense.payLaterProviderKey) {
      const digest = createHash("sha256").update(expense.payLaterProviderKey).digest("hex");
      params.set("paymentProvider", `pay-later:${digest}`);
    }
  } else if (expense.bankAssignmentId !== null) {
    params.set("bank", `assignment:${expense.bankAssignmentId}`);
  } else if (expense.legacyBankName?.trim()) {
    const digest = createHash("sha256").update(expense.legacyBankName).digest("hex");
    params.set("bank", `legacy:${digest}`);
  }
  if (grouped) params.set("view", "grouped");
  return params.toString();
}

export default function ExpensesTab({ expenseGroupId, categories, bankOptions, payLaterProviders, historyProviderOptions, merchantLabel, expensePage, historyAvailability, view, links }: ExpensesTabProps) {
  const { day, month, through, grouped, filterQuery, currentMonth, hasOtherFilters } = view;
  const { groupPath, expensesPath, expenseTab, allMonthsHref } = links;
  const { totalExpenses, totalCentavos } = expensePage;
  const selectedExpense = view.filters.expenseId === undefined ? undefined : expensePage.expenses[0];
  const firstExpense = historyAvailability === "none";
  const thisMonthOnly = month === currentMonth && !day && !through && !hasOtherFilters;
  const emptyStateTitle = firstExpense
    ? "No expenses yet"
    : thisMonthOnly ? "No expenses this month" : "No expenses match these filters";

  return (
    <>
      <ExpenseHistoryFilters
        key={expenseGroupId}
        groupPath={expensesPath}
        filterQuery={selectedExpense ? selectedExpenseFilterQuery(selectedExpense, grouped) : filterQuery}
        categories={categories}
        providers={historyProviderOptions}
        merchantLabel={merchantLabel}
        currentMonth={currentMonth}
        clearFiltersHref={groupPath + expenseTab}
        canClearFilters={day !== undefined || through !== undefined || month !== currentMonth || hasOtherFilters}
      />
      <section aria-labelledby="expense-history-title">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="expense-history-title" tabIndex={-1} className="text-lg font-semibold sm:mr-auto">Expenses</h2>
          <nav aria-label="Expense history view" className="inline-flex shrink-0 gap-0.5 rounded-lg border border-gray-800 p-0.5 sm:order-last">
            {[
              { label: "Table", grouped: false },
              { label: "Grouped by day", grouped: true },
            ].map((option) => {
              const current = grouped === option.grouped;
              return (
                <Link
                  key={option.label}
                  href={links.historyViewHref(option.grouped, expensePage.page)}
                  prefetch={false}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-red-400 ${current ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-white"}`}
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-start gap-2 max-sm:basis-full [&_button]:min-h-10">
            <ImportExpensesButton key={expenseGroupId} expenseGroupId={expenseGroupId} categories={categories} />
            <ExportExpensesButton exportHref={`${groupPath}/export?${filterQuery}`} />
          </div>
        </header>
        {!grouped && totalExpenses > 0 && (
          <p className="mb-2 text-sm text-gray-400 tabular-nums">
            {totalExpenses} {totalExpenses === 1 ? "matching expense" : "matching expenses"} · {formatPesoAmount(totalCentavos)} total
          </p>
        )}

        {totalExpenses === 0 ? (
          <ExpenseGroupEmptyState icon="💸" title={emptyStateTitle}>
            {firstExpense && (
              categories.length === 0 ? (
                <p className="mt-1 text-sm text-gray-400">
                  Select <strong className="font-medium text-gray-300">+ New Category</strong> to start recording expenses.
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-400">
                  Select <strong className="font-medium text-gray-300">+ New Expense</strong> to add your first expense.
                </p>
              )
            )}
            {historyAvailability === "older" && (
              <Link href={allMonthsHref} className="mt-3 text-sm text-gray-300 underline underline-offset-4 hover:text-white">
                All months
              </Link>
            )}
          </ExpenseGroupEmptyState>
        ) : (
          <ExpenseHistory
            groupPath={expensesPath}
            expenseGroupId={expenseGroupId}
            categories={categories}
            bankOptions={bankOptions}
            payLaterProviders={payLaterProviders}
            expenses={expensePage.expenses}
            groupedSummary={grouped ? { day, month, through, totalExpenses, totalCentavos } : undefined}
            page={expensePage.page}
            totalPages={expensePage.totalPages}
            filterQuery={filterQuery}
          />
        )}
      </section>
    </>
  );
}
