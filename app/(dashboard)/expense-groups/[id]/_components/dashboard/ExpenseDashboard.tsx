import Link from "next/link";
import type { ReactNode } from "react";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import type { DashboardData } from "../../_lib/dashboard/access";
import { lastDayOfDashboardMonth } from "../../_lib/dashboard/period";
import ExpenseGroupEmptyState from "../ExpenseGroupEmptyState";
import SpendingTrend from "./SpendingTrend";

export default function ExpenseDashboard({
  dashboard,
  groupPath,
  budget,
}: {
  dashboard: DashboardData;
  groupPath: string;
  budget: ReactNode;
}) {
  const { month, throughDay } = dashboard;
  const through = throughDay < lastDayOfDashboardMonth(month) ? throughDay : undefined;

  return (
    <div className="space-y-4 sm:space-y-5">
      {budget}
      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <section
          aria-labelledby="dashboard-categories-heading"
          className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6 lg:col-start-2 lg:row-start-1"
        >
          <h2 id="dashboard-categories-heading" className="text-lg font-semibold">Spending by category</h2>
          {dashboard.categories.length === 0 ? (
            <ExpenseGroupEmptyState icon="💸" title="No expenses in this period." compact />
          ) : (
            <ul className="mt-3 divide-y divide-gray-800">
              {dashboard.categories.map(({ id, name, totalCentavos }) => (
                <li key={id}>
                  <Link
                    href={{
                      pathname: `${groupPath}/expenses`,
                      query: through ? { month, through, category: id } : { month, category: id },
                    }}
                    prefetch={false}
                    className="group block rounded-lg px-2 py-3 hover:bg-background/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere] group-hover:underline">{name}</span>
                      <span className="ml-auto inline-flex items-center gap-2 font-semibold tabular-nums">
                        {formatPesoAmount(totalCentavos)}
                        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0 text-gray-400">
                          <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                    <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
                      <div
                        className="h-full rounded-full bg-red-400"
                        style={{ width: `${totalCentavos / dashboard.totalCentavos * 100}%` }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <SpendingTrend dashboard={dashboard} />
      </div>
    </div>
  );
}
