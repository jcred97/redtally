"use client";

import { useParams } from "next/navigation";
import Skeleton from "@/app/components/feedback/Skeleton";
import PaymentProvidersSkeleton from "./banks/PaymentProvidersSkeleton";
import CategoriesSkeleton from "./categories/CategoriesSkeleton";
import DashboardSkeleton from "./dashboard/DashboardSkeleton";
import ExpensesSkeleton from "./expenses/ExpensesSkeleton";
import RecurringExpensesSkeleton from "./recurring-expenses/RecurringExpensesSkeleton";

function TabSkeleton({ tab }: { tab: string }) {
  switch (tab) {
    case "dashboard":
      return <DashboardSkeleton />;
    case "expenses":
      return <ExpensesSkeleton />;
    case "recurring":
      return <RecurringExpensesSkeleton />;
    case "categories":
      return <CategoriesSkeleton />;
    case "payment-providers":
      return <PaymentProvidersSkeleton />;
    default:
      return null;
  }
}

export default function ExpenseGroupSkeleton() {
  const { tab: segments = [] } = useParams<{ tab?: string[] }>();
  const [tab = "dashboard"] = segments;
  const primaryAction = tab === "recurring" ? "+ New Recurring Expense"
    : tab === "categories" ? "+ New Category"
    : tab === "expenses" || tab === "dashboard" ? "+ New Expense"
    : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 text-white sm:px-6">
      <p role="status" className="sr-only">
        Loading expense group...
      </p>

      <header className="pt-6" aria-hidden="true">
        <div className="flex min-h-10 items-center justify-between gap-4">
          <Skeleton className="h-8 w-44 sm:h-9 sm:w-52" />
          <Skeleton className="h-6 w-20 shrink-0" />
        </div>
        <div className="mt-4 sm:mt-6 lg:grid lg:grid-cols-[1fr_auto] lg:gap-6 lg:border-b lg:border-gray-800">
          <div className="flex flex-wrap border-b border-gray-800 text-sm font-medium text-gray-400 lg:min-h-14 lg:border-b-0">
            {["Dashboard", "Expenses", "Recurring", "Categories", "Payment Provider"].map((label) => (
              <span key={label} className="-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-2.5 sm:px-4">{label}</span>
            ))}
          </div>
          {primaryAction && (
            <div className="mt-3 flex justify-end lg:my-2 lg:self-center">
              <div className="relative flex min-h-10 items-center px-4 py-2 text-sm font-medium">
                <Skeleton className="absolute inset-0 rounded-lg" />
                <span className="invisible">{primaryAction}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main aria-hidden="true" className="py-6 sm:py-8">
        {segments.length <= 1 && <TabSkeleton tab={tab} />}
      </main>
    </div>
  );
}
