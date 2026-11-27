import Link from "next/link";
import type { ReactNode } from "react";
import { formatExpenseDate, formatExpenseTime, parseExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import SpendingTrend from "../../expense-groups/[id]/_components/dashboard/SpendingTrend";
import { canonicalExpenseGroupHref, expenseHistoryEntryHref, recurringExpenseAnchor } from "../../expense-groups/[id]/_lib/navigation";
import { lastDayOfDashboardMonth } from "../../expense-groups/[id]/_lib/dashboard/period";
import type { getHomeDashboard } from "./queries";

type DashboardData = NonNullable<Awaited<ReturnType<typeof getHomeDashboard>>>;

const monthFormatter = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const inlineLink = "rounded-sm text-sm font-medium text-red-300 underline underline-offset-4 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400";
const rowLink = "flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-3 hover:bg-background/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400";

function DashboardPanel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ReportRow({ href, label, description, amount }: { href: string; label: string; description: string; amount: number | bigint }) {
  return (
    <li>
      <Link href={href} prefetch={false} className={rowLink}>
        <span className="min-w-0 flex-1 wrap-anywhere">
          <span className="block text-sm font-medium text-white">{label}</span>
          <span className="mt-0.5 block text-xs text-gray-400">{description}</span>
        </span>
        <span className="max-w-full wrap-anywhere text-right text-sm font-semibold tabular-nums">
          {formatPesoAmount(amount)}
        </span>
      </Link>
    </li>
  );
}

export default function DashboardReport({ data, today }: { data: DashboardData; today: string }) {
  const { month, throughDay, comparison, groups, budget, categories, merchants, recentExpenses, upcoming, attention } = data;
  const through = throughDay < lastDayOfDashboardMonth(month) ? throughDay : undefined;
  const isCurrentMonth = month === today.slice(0, 7);
  const monthLabel = monthFormatter.format(parseExpenseDate(`${month}-01`));
  const budgetPercent = budget.targetCentavos > BigInt(0)
    ? Math.min(100, Number(budget.spentCentavos) / Number(budget.targetCentavos) * 100)
    : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section aria-label="Included expense groups" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-gray-300">Included groups</p>
        <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
          {groups.map(({ publicId, name }) => (
            <li key={publicId} className="min-w-0 wrap-anywhere">
              <Link href={canonicalExpenseGroupHref(publicId, { month, through }, "expenses")} className={inlineLink} prefetch={false}>
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <DashboardPanel id="dashboard-spent-heading" title={isCurrentMonth ? "Spent this month" : `Spent in ${monthLabel}`}>
          <p className="mt-2 wrap-anywhere text-3xl font-bold tracking-tight tabular-nums">{formatPesoAmount(data.totalCentavos)}</p>
          <p className="mt-1 text-sm text-gray-400">
            {data.expenseCount} {data.expenseCount === 1 ? "expense" : "expenses"}
            {through && <> · Through {formatExpenseDate(through)}</>}
          </p>
          {comparison && (
            <dl className="mt-4 border-t border-gray-800 pt-3">
              <dt className="text-sm text-gray-400">Previous period through {formatExpenseDate(comparison.throughDay)}</dt>
              <dd className="mt-1 wrap-anywhere font-semibold tabular-nums">{formatPesoAmount(comparison.totalCentavos)}</dd>
            </dl>
          )}
        </DashboardPanel>

        <DashboardPanel id="dashboard-budget-heading" title="Budget progress">
          <p className="mt-2 text-sm text-gray-300">{budget.groupCount} of {groups.length} groups budgeted</p>
          {budget.groupCount > 0 ? (
            <>
              <p className="mt-2 wrap-anywhere font-semibold tabular-nums">
                {formatPesoAmount(budget.spentCentavos)} of {formatPesoAmount(budget.targetCentavos)}
              </p>
              <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800">
                <div className="h-full rounded-full bg-red-400" style={{ width: `${budgetPercent}%` }} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-400">Set a monthly target in an expense group’s dashboard.</p>
          )}
          {budget.groupCount < groups.length && (
            <p className="mt-3 wrap-anywhere text-sm text-gray-400">
              <span className="font-medium text-gray-200 tabular-nums">{formatPesoAmount(budget.unbudgetedCentavos)}</span> unbudgeted spending
            </p>
          )}
          <details className="mt-4 border-t border-gray-800 pt-3">
            <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium text-gray-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400">
              Budgets by group
            </summary>
            <ul className="mt-1 divide-y divide-gray-800">
              {groups.map(({ publicId, name, totalCentavos, budgetCentavos }) => (
                <ReportRow
                  key={publicId}
                  href={canonicalExpenseGroupHref(publicId, { month }, "dashboard")}
                  label={name}
                  description={budgetCentavos === null ? "No target" : `Target ${formatPesoAmount(budgetCentavos)}`}
                  amount={totalCentavos}
                />
              ))}
            </ul>
          </details>
        </DashboardPanel>

        <DashboardPanel id="dashboard-upcoming-heading" title="Upcoming expenses">
          <p className="mt-2 text-sm text-gray-400">Scheduled from {formatExpenseDate(today)}.</p>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-gray-300">No upcoming recurring expenses.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-800">
              {upcoming.map(({ id, title, amountCentavos, nextDueDate, group }) => (
                <ReportRow
                  key={id}
                  href={`${canonicalExpenseGroupHref(group.publicId, {}, "recurring")}#${recurringExpenseAnchor(id)}`}
                  label={title}
                  description={`${group.name} · ${formatExpenseDate(nextDueDate)}`}
                  amount={amountCentavos}
                />
              ))}
            </ul>
          )}
        </DashboardPanel>
      </div>

      {attention.length > 0 && (
        <DashboardPanel id="dashboard-attention-heading" title="Needs attention">
          <ul className="mt-2 divide-y divide-gray-800">
            {attention.map(({ id, title, amountCentavos, nextDueDate, group, reason }) => (
              <ReportRow
                key={id}
                href={`${canonicalExpenseGroupHref(group.publicId, {}, "recurring")}#${recurringExpenseAnchor(id)}`}
                label={title}
                description={`${group.name} · ${reason === "blocked" ? "Check bank and payment settings, then resume" : "Run due expenses"} · ${formatExpenseDate(nextDueDate)}`}
                amount={amountCentavos}
              />
            ))}
          </ul>
        </DashboardPanel>
      )}

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="space-y-4 sm:space-y-5">
          <SpendingTrend dashboard={data} />
          <DashboardPanel id="dashboard-recent-heading" title="Recent expenses">
            {recentExpenses.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">No expenses in this period.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-800">
                {recentExpenses.map(({ id, title, merchant, date, timeMinutes, category, group, amountCentavos }) => (
                  <ReportRow
                    key={id}
                    href={expenseHistoryEntryHref(group.publicId, id)}
                    label={title}
                    description={[
                      group.name, category.name, merchant, formatExpenseDate(date),
                      timeMinutes === null ? null : formatExpenseTime(timeMinutes),
                    ].filter(Boolean).join(" · ")}
                    amount={amountCentavos}
                  />
                ))}
              </ul>
            )}
          </DashboardPanel>
        </div>
        <div className="space-y-4 sm:space-y-5">
          <DashboardPanel id="home-dashboard-categories-heading" title="Spending by category">
            {categories.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">No expenses in this period.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-800">
                {categories.map(({ id, name, group, totalCentavos }) => (
                  <ReportRow
                    key={id}
                    href={canonicalExpenseGroupHref(group.publicId, { month, through, category: String(id) }, "expenses")}
                    label={name}
                    description={group.name}
                    amount={totalCentavos}
                  />
                ))}
              </ul>
            )}
          </DashboardPanel>
          <DashboardPanel id="home-dashboard-merchants-heading" title="Spending by merchant">
            {merchants.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">No named merchants in this period.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-800">
                {merchants.map(({ name, filter, group, totalCentavos }) => (
                  <ReportRow
                    key={`${group.id}:${filter}`}
                    href={canonicalExpenseGroupHref(group.publicId, { month, through, merchant: filter }, "expenses")}
                    label={name}
                    description={group.name}
                    amount={totalCentavos}
                  />
                ))}
              </ul>
            )}
          </DashboardPanel>
        </div>
      </div>
    </div>
  );
}
