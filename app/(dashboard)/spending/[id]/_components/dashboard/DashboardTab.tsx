import type { ComponentProps } from "react";
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
};

export default function DashboardTab({ dashboard, groupPath, expenseGroupId, currentMonth, categories, bankOptions }: DashboardTabProps) {
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
    </>
  );
}
