import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getExpenseGroupOptions } from "@/app/(dashboard)/_lib/expense-groups/queries";
import { requireUser } from "@/app/lib/auth/session";
import { getManilaToday, parseExpenseMonth } from "@/app/lib/expenses/date";
import DashboardControls from "./_home/dashboard/DashboardControls";
import DashboardReport from "./_home/dashboard/DashboardReport";
import DashboardUnavailable from "./_home/dashboard/DashboardUnavailable";
import { getHomeDashboard } from "./_home/dashboard/queries";

type DashboardQuery = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<DashboardQuery> }) {
  await requireUser();
  const query = await searchParams;

  return (
    <main className="dashboard-frame py-6 text-white sm:py-9">
      <h1 className="mb-5 text-2xl font-bold tracking-tight sm:mb-7 sm:text-3xl">Overview</h1>
      <DashboardContent query={query} />
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

    const scope = new URLSearchParams({ month, scope: "1" });
    for (const publicId of selectedIds) scope.append("group", publicId);
    const dashboard = selectedIds.length > 0 ? await getHomeDashboard(selectedIds, month, today) : null;
    return {
      status: "loaded", ownedGroups, today,
      scopeQuery: scope.toString(), dashboard,
    } as const;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Overview data could not be loaded", error instanceof Error ? error.name : "UnknownError");
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

  const { ownedGroups, today, scopeQuery, dashboard } = result;

  return (
    <div className="space-y-4 sm:space-y-5">
      <DashboardControls groups={ownedGroups} scopeQuery={scopeQuery} />
      {dashboard && dashboard.groups.length > 0 ? (
        <DashboardReport data={dashboard} today={today} />
      ) : (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="font-semibold">No expense groups selected</h2>
          <p className="mt-1 text-sm text-gray-300">Select at least one group to see spending totals and activity.</p>
        </section>
      )}
    </div>
  );
}
