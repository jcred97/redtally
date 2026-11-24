"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import Skeleton from "@/app/components/feedback/Skeleton";
import ExpenseGroupsSkeleton from "../expense-groups/_components/ExpenseGroupsSkeleton";
import NewExpenseGroupButton from "./expense-groups/NewExpenseGroupButton";

function MainNavigationSkeleton({ pathname }: { pathname: string }) {
  if (pathname === "/expense-groups") {
    return (
      <main className="dashboard-frame py-10">
        <div className="mb-8 flex flex-wrap items-center gap-2 sm:gap-4">
          <h1 className="min-w-0 wrap-anywhere text-lg font-bold tracking-tight sm:text-3xl">All Expense Groups</h1>
          <div className="ml-auto whitespace-nowrap max-sm:[&>button]:px-2.5 max-sm:[&>button]:text-xs">
            <NewExpenseGroupButton />
          </div>
        </div>
        <ExpenseGroupsSkeleton />
      </main>
    );
  }

  return (
    <main className="dashboard-frame py-6 text-white sm:py-9">
      <h1 className="mb-5 text-2xl font-bold tracking-tight sm:mb-7 sm:text-3xl">Overview</h1>
      <div role="status" className="space-y-4">
        <span className="sr-only">Loading overview</span>
        <Skeleton className="h-36" />
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </main>
  );
}

export default function MainNavigationBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname !== "/" && pathname !== "/expense-groups") return children;

  // Keep the boundary mounted when switching the main tabs so React can retain the current page.
  return <Suspense fallback={<MainNavigationSkeleton pathname={pathname} />}>{children}</Suspense>;
}
