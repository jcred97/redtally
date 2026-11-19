import Link from "next/link";
import type { ComponentProps } from "react";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import type { ExpenseHistoryAvailability } from "@/app/(dashboard)/_lib/expense-groups/access";
import type { getExpensePageByExpenseGroupId } from "@/app/(dashboard)/_lib/expense-groups/queries";
import type { ExpenseGroupLinks, ExpenseGroupView } from "../../_lib/navigation";
import ExpenseHistory from "./ExpenseHistory";
import ExpenseHistoryFilters from "./ExpenseHistoryFilters";

type ExpensesTabProps = {
  expenseGroupId: number;
  categories: ComponentProps<typeof ExpenseHistory>["categories"];
  bankOptions: ComponentProps<typeof ExpenseHistory>["bankOptions"];
  historyBankOptions: ComponentProps<typeof ExpenseHistoryFilters>["banks"];
  merchantLabel?: string;
  expensePage: NonNullable<Awaited<ReturnType<typeof getExpensePageByExpenseGroupId>>>;
  historyAvailability?: ExpenseHistoryAvailability;
  view: ExpenseGroupView;
  links: ExpenseGroupLinks;
};

export default function ExpensesTab({ expenseGroupId, categories, bankOptions, historyBankOptions, merchantLabel, expensePage, historyAvailability, view, links }: ExpensesTabProps) {
  const { day, month, through, categoryId, paymentMethod, bankFilterValue, merchant, merchantSearch, grouped, filterQuery, currentMonth, hasOtherFilters } = view;
  const { groupPath, expenseTab, categoriesTab, allMonthsHref } = links;
  const firstExpense = historyAvailability === "none";
  const thisMonthOnly = month === currentMonth && !day && !through && !hasOtherFilters;
  const emptyStateTitle = firstExpense
    ? "No expenses yet"
    : thisMonthOnly ? "No expenses this month" : "No expenses match these filters";

  return (
    <>
      <ExpenseHistoryFilters
        key={`${expenseGroupId}:${filterQuery}:${expensePage.page}`}
        groupPath={groupPath}
        categories={categories}
        banks={historyBankOptions}
        month={month}
        day={day}
        through={through}
        categoryId={categoryId}
        paymentMethod={paymentMethod}
        bank={bankFilterValue}
        merchant={merchant}
        merchantLabel={merchantLabel}
        merchantSearch={merchantSearch}
        grouped={grouped}
        monthScopeHref={links.monthScopeHref}
        clearFiltersHref={groupPath + expenseTab}
        canClearFilters={day !== undefined || through !== undefined || month !== currentMonth || hasOtherFilters}
      />
      <section aria-labelledby="expense-history-title">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="expense-history-title" tabIndex={-1} className="text-lg font-semibold">Expenses</h2>
          <nav aria-label="Expense history view" className="inline-flex gap-0.5 rounded-lg border border-gray-800 p-0.5">
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
        </header>
        {!grouped && (
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="mb-1 text-sm text-gray-400">Total Spent</p>
              <p className="text-2xl font-bold">
                {formatPesoAmount(expensePage.totalCentavos)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="mb-1 text-sm text-gray-400">Expenses</p>
              <p className="text-2xl font-bold">{expensePage.totalExpenses}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <p className="mb-1 text-sm text-gray-400">Group categories</p>
              <p className="text-2xl font-bold">{categories.length}</p>
            </div>
          </div>
        )}

        {expensePage.totalExpenses === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-gray-800 bg-gray-900">
              <span className="text-2xl">💸</span>
            </div>
            <p className="font-medium text-gray-300">{emptyStateTitle}</p>
            {firstExpense && (categories.length === 0 ? (
              <>
                <p className="mt-1 text-sm text-gray-400">Create a category to start recording expenses.</p>
                <Link href={groupPath + categoriesTab} className="mt-3 text-sm text-gray-300 underline underline-offset-4 hover:text-white">
                  Go to Categories
                </Link>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-400">
                Select <strong className="font-medium text-gray-300">+ New Expense</strong> to add your first expense.
              </p>
            ))}
            {historyAvailability === "older" && (
              <Link href={allMonthsHref} className="mt-3 text-sm text-gray-300 underline underline-offset-4 hover:text-white">
                All months
              </Link>
            )}
          </div>
        ) : (
          <ExpenseHistory
            groupPath={groupPath}
            expenseGroupId={expenseGroupId}
            categories={categories}
            bankOptions={bankOptions}
            expenses={expensePage.expenses}
            groupedSummary={grouped ? { day, month, through, totalExpenses: expensePage.totalExpenses, totalCentavos: expensePage.totalCentavos } : undefined}
            page={expensePage.page}
            totalPages={expensePage.totalPages}
            filterQuery={filterQuery}
          />
        )}
      </section>
    </>
  );
}
