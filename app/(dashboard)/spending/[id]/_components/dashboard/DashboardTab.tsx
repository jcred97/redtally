import type { ComponentProps } from "react";
import Link from "next/link";
import DashboardMonthNavigation from "./DashboardMonthNavigation";
import ExpenseDashboard from "./ExpenseDashboard";
import MonthlyBudgetCard from "./MonthlyBudgetCard";
import NewCategoryButton from "../categories/NewCategoryButton";
import NewExpenseButton from "../expenses/NewExpenseButton";

type DashboardTabProps = {
  dashboard: ComponentProps<typeof ExpenseDashboard>["dashboard"];
  groupPath: string;
  expenseGroupId: number;
  currentMonth: string;
  categories: ComponentProps<typeof NewExpenseButton>["categories"];
  bankOptions: ComponentProps<typeof NewExpenseButton>["bankOptions"];
  linkedLoans: ReadonlyArray<{ id: string; title: string }>;
};

export default function DashboardTab({ dashboard, groupPath, expenseGroupId, currentMonth, categories, bankOptions, linkedLoans }: DashboardTabProps) {
  return (
    <>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-3 sm:gap-x-6">
        <DashboardMonthNavigation groupPath={groupPath} month={dashboard.month} currentMonth={currentMonth} />
        <div className="[&_button]:min-h-11">
          {categories.length > 0 ? (
            <NewExpenseButton key={expenseGroupId} expenseGroupId={expenseGroupId} categories={categories} bankOptions={bankOptions} />
          ) : (
            <NewCategoryButton key={expenseGroupId} expenseGroupId={expenseGroupId} />
          )}
        </div>
      </header>
      <ExpenseDashboard
        dashboard={dashboard}
        groupPath={groupPath}
        budget={
          <MonthlyBudgetCard
            key={`${expenseGroupId}:${dashboard.month}`}
            expenseGroupId={expenseGroupId}
            month={dashboard.month}
            totalCentavos={dashboard.totalCentavos}
            expenseCount={dashboard.expenseCount}
            budgetCentavos={dashboard.budgetCentavos}
          />
        }
      />
      {linkedLoans.length > 0 && (
        <section aria-labelledby="linked-loans-heading" className="mt-5 rounded-xl border border-gray-800 p-4 sm:p-5">
          <h2 id="linked-loans-heading" className="text-lg font-semibold">Linked cash loans</h2>
          <ul className="mt-2 divide-y divide-gray-800">
            {linkedLoans.map((loan) => (
              <li key={loan.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 wrap-anywhere text-sm">{loan.title}</span>
                <Link href={`/loans/cash/${loan.id}`} aria-label={`View loan: ${loan.title}`} className="button-secondary inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium">View Loan</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
