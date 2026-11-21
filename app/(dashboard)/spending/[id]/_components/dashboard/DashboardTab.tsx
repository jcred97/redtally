import type { ComponentProps } from "react";
import DashboardMonthNavigation from "./DashboardMonthNavigation";
import ExpenseDashboard from "./ExpenseDashboard";
import MonthlyBudgetCard from "./MonthlyBudgetCard";

type DashboardTabProps = {
  dashboard: ComponentProps<typeof ExpenseDashboard>["dashboard"];
  groupPath: string;
  expenseGroupId: number;
  currentMonth: string;
};

export default function DashboardTab({ dashboard, groupPath, expenseGroupId, currentMonth }: DashboardTabProps) {
  return (
    <>
      <div className="mb-5">
        <DashboardMonthNavigation groupPath={groupPath} month={dashboard.month} currentMonth={currentMonth} />
      </div>
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
