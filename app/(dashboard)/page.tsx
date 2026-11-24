import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { getBankAssignmentOptions } from "@/app/(dashboard)/_lib/banks/queries";
import { getExpenseGroupById, getExpenseGroupOptions } from "@/app/(dashboard)/_lib/expense-groups/queries";
import Skeleton from "@/app/components/feedback/Skeleton";
import { requireUser } from "@/app/lib/auth/session";
import { getManilaToday, parseExpenseMonth } from "@/app/lib/expenses/date";
import DashboardControls from "./_home/dashboard/DashboardControls";
import DashboardReport from "./_home/dashboard/DashboardReport";
import DashboardUnavailable from "./_home/dashboard/DashboardUnavailable";
import { getHomeDashboard } from "./_home/dashboard/queries";
import NewCategoryButton from "./expense-groups/[id]/_components/categories/NewCategoryButton";
import NewExpenseButton from "./expense-groups/[id]/_components/expenses/NewExpenseButton";

type DashboardQuery = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<DashboardQuery> }) {
  await requireUser();
  const query = await searchParams;

  return (
    <main className="dashboard-frame py-6 text-white sm:py-9">
      <h1 className="mb-5 text-2xl font-bold tracking-tight sm:mb-7 sm:text-3xl">Dashboard</h1>
      <Suspense fallback={
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading dashboard</span>
          <Skeleton className="h-36" />
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      }>
        <DashboardContent query={query} />
      </Suspense>
    </main>
  );
}

async function loadDashboard(query: DashboardQuery) {
  try {
    const ownedGroups = (await getExpenseGroupOptions()).sort((left, right) => left.id - right.id);
    if (ownedGroups.length === 0) return { status: "no-groups" } as const;

    const today = getManilaToday();
    const month = parseExpenseMonth(query.month) ?? today.slice(0, 7);
    const requestedGroups = typeof query.group === "string" ? [query.group] : (query.group ?? []);
    const requestedIds = new Set(requestedGroups.map((id) => id.toLowerCase()));
    // Selecting all groups by default can double-count expenses copied with a group.
    const selectedGroups = query.scope === "1" || query.group !== undefined
      ? ownedGroups.filter(({ publicId }) => requestedIds.has(publicId))
      : ownedGroups.slice(0, 1);
    const selectedIds = selectedGroups.map(({ publicId }) => publicId);
    const requestedEntry = ownedGroups.find(({ publicId }) => publicId === query.entry);
    const entry = requestedEntry ?? selectedGroups[0] ?? ownedGroups[0];

    const scope = new URLSearchParams({ month, scope: "1" });
    for (const publicId of selectedIds) scope.append("group", publicId);
    if (requestedEntry) scope.set("entry", requestedEntry.publicId);

    const [dashboard, entryGroup, bankOptions] = await Promise.all([
      selectedIds.length > 0 ? getHomeDashboard(selectedIds, month, today) : null,
      getExpenseGroupById(entry.id),
      getBankAssignmentOptions(entry.id),
    ]);
    return {
      status: "loaded", ownedGroups, entry, today,
      scopeQuery: scope.toString(), dashboard, entryGroup, bankOptions,
    } as const;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Dashboard data could not be loaded", error instanceof Error ? error.name : "UnknownError");
    return { status: "unavailable" } as const;
  }
}

async function DashboardContent({ query }: { query: DashboardQuery }) {
  const result = await loadDashboard(query);
  if (result.status === "unavailable") return <DashboardUnavailable />;
  if (result.status === "no-groups") {
    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold">No expense groups yet</h2>
        <p className="mt-2 text-sm text-gray-300">Create an expense group to start tracking your spending.</p>
        <Link href="/expense-groups" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-red-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400">
          Go to Expense Groups
        </Link>
      </section>
    );
  }

  const { ownedGroups, entry, today, scopeQuery, dashboard, entryGroup, bankOptions } = result;
  const categories = entryGroup?.categories.map(({ id, name }) => ({ id, name })) ?? [];

  return (
    <div className="space-y-4 sm:space-y-5">
      <DashboardControls groups={ownedGroups} entryId={entry.publicId} scopeQuery={scopeQuery}>
        {entryGroup && (categories.length > 0 ? (
          <NewExpenseButton key={entry.id} expenseGroupId={entry.id} categories={categories} bankOptions={bankOptions} />
        ) : (
          <NewCategoryButton key={entry.id} expenseGroupId={entry.id} />
        ))}
        {!entryGroup && <p role="status" className="text-sm text-gray-300">This expense group is no longer available.</p>}
      </DashboardControls>
      {dashboard && dashboard.groups.length > 0 ? (
        <DashboardReport data={dashboard} today={today} />
      ) : (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="font-semibold">No expense groups selected</h2>
          <p className="mt-1 text-sm text-gray-300">Select at least one group to see dashboard totals and activity.</p>
        </section>
      )}
    </div>
  );
}
