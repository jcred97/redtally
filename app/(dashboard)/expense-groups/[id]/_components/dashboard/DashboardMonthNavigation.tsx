import Link from "next/link";
import { shiftDashboardMonth } from "../../_lib/dashboard/period";
import { parseExpenseDate } from "@/app/lib/expenses/date";

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const arrowClass = "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-gray-300 hover:bg-gray-800 hover:text-white focus-visible:outline-2 focus-visible:outline-red-400";

export default function DashboardMonthNavigation({
  groupPath,
  month,
  currentMonth,
}: {
  groupPath: string;
  month: string;
  currentMonth: string;
}) {
  const monthLabel = monthFormatter.format(parseExpenseDate(`${month}-01`));

  function monthHref(value: string) {
    return `${groupPath}/dashboard?month=${value}`;
  }

  function monthArrow(offset: -1 | 1) {
    const target = shiftDashboardMonth(month, offset);
    if (!target) return <span aria-hidden="true" className="size-11 shrink-0" />;

    return (
      <Link
        href={monthHref(target)}
        aria-label={offset < 0 ? "Previous month" : "Next month"}
        prefetch={false}
        className={arrowClass}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
          <path d={offset < 0 ? "m10 3-5 5 5 5" : "m6 3 5 5-5 5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    );
  }

  return (
    <nav aria-label="Dashboard month" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="inline-flex items-center rounded-full border border-gray-700 bg-gray-900">
        {monthArrow(-1)}
        <time dateTime={month} className="min-w-29 px-1 text-center text-sm font-semibold tabular-nums">{monthLabel}</time>
        {monthArrow(1)}
      </div>
      {month !== currentMonth && (
        <Link
          href={groupPath}
          className="inline-flex min-h-11 items-center rounded-sm text-sm text-gray-300 underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-red-400"
        >
          This month
        </Link>
      )}
    </nav>
  );
}
