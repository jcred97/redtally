import { useSearchParams } from "next/navigation";
import Skeleton from "@/app/components/feedback/Skeleton";
import { formatExpenseDate, getManilaToday, parseExpenseDay, parseExpenseMonth } from "@/app/lib/expenses/date";

const expenseColumns = ["Date & time", "Title", "Category", "Payment Method", "Payment Provider", "Amount"];

function GroupedHistorySkeleton() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-1 h-7 w-24" />
        </div>
        <div className="ml-auto">
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="mt-1 h-7 w-24" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-y border-gray-800 bg-gray-800/55 px-4 py-3 sm:px-6">
        <div>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-1 h-4 w-16" />
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="divide-y divide-gray-800">
        {[0, 1, 2].map((row) => (
          <div key={row} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_7.5rem_auto] sm:gap-x-4 sm:px-6">
            <div className="min-w-0">
              <Skeleton className="h-5 w-32 max-w-full sm:h-6" />
              <Skeleton className="mt-1 h-4 w-24 max-w-full" />
            </div>
            <Skeleton className="col-start-1 row-start-2 mt-1 h-4 w-14 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:justify-self-end" />
            <Skeleton className="col-start-2 row-start-1 h-5 w-16 justify-self-end sm:col-start-3" />
            <Skeleton className="col-start-3 row-start-1 size-9 rounded-lg sm:col-start-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableHistorySkeleton() {
  return (
    <>
      <Skeleton className="mb-2 h-5 w-44" />
      <div className="space-y-3 sm:hidden">
        {[0, 1, 2].map((row) => (
          <div key={row} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="mt-0.5 h-4 w-1/3" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="mt-2 h-5 w-2/3" />
            <Skeleton className="mt-1 h-5 w-1/2" />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Skeleton className="h-10 w-14 rounded-lg" />
              <Skeleton className="h-10 w-18 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-separate border-spacing-y-1.5 text-sm [&_:is(th,td)]:px-2.5 lg:[&_:is(th,td)]:px-4">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-400 [&>th]:border-b [&>th]:border-gray-800">
              {expenseColumns.map((column) => (
                <th key={column} className={`py-4 ${column === "Amount" ? "text-right" : ""}`}>{column}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3].map((row) => (
              <tr key={row} className="bg-gray-900 [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl">
                <td className="py-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="mt-0.5 h-4 w-14" />
                </td>
                <td className="py-4">
                  <Skeleton className="h-5 w-24 lg:w-40" />
                  <Skeleton className="mt-0.5 h-4 w-20 lg:w-24" />
                </td>
                <td className="py-4"><Skeleton className="h-5 w-14 lg:w-20" /></td>
                <td className="py-4"><Skeleton className="h-5 w-14 lg:w-20" /></td>
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <Skeleton className="h-5 w-10 lg:w-24" />
                  </div>
                </td>
                <td className="py-4"><Skeleton className="ml-auto h-5 w-14 lg:w-20" /></td>
                <td className="py-2"><Skeleton className="ml-auto size-9 rounded-lg" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ExpensesSkeleton() {
  const searchParams = useSearchParams();

  function filter(name: string) {
    const values = searchParams.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  }

  const grouped = filter("view") === "grouped";
  const currentMonth = getManilaToday().slice(0, 7);
  const day = parseExpenseDay(filter("day"));
  const month = day?.slice(0, 7) ?? parseExpenseMonth(filter("month")) ?? (filter("allMonths") === "1" ? undefined : currentMonth);
  const throughDay = parseExpenseDay(filter("through"));
  const through = !day && throughDay?.slice(0, 7) === month ? throughDay : undefined;
  const canClearFilters = day || through || month !== currentMonth ||
    ["expense", "category", "paymentMethod", "paymentProvider", "bank", "merchant", "search", "merchantSearch"]
      .some((key) => filter(key)?.trim());

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 md:grid-cols-3">
        {["w-28", "w-12", "w-24", "w-16", "w-32", "w-36"].map((width) => (
          <div key={width}>
            <Skeleton className={`h-5 ${width}`} />
            <Skeleton className="mt-1 h-10 rounded-lg" />
          </div>
        ))}
        <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-800 pt-3">
          {through && <span className="text-sm text-gray-400">Through {formatExpenseDate(through)}</span>}
          <span className="text-sm text-gray-300 underline underline-offset-4">
            {day || through ? "Full month" : month ? "All months" : "This month"}
          </span>
          {canClearFilters && <span className="text-sm text-gray-300 underline underline-offset-4">Clear filters</span>}
        </div>
      </div>
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-lg font-semibold sm:mr-auto">Expenses</h2>
          <div className="inline-flex shrink-0 gap-0.5 rounded-lg border border-gray-800 p-0.5 sm:order-last">
            <span className={`inline-flex min-h-9 items-center rounded-md px-2.5 text-sm font-medium ${grouped ? "text-gray-400" : "bg-gray-800 text-white"}`}>Table</span>
            <span className={`inline-flex min-h-9 items-center rounded-md px-2.5 text-sm font-medium ${grouped ? "bg-gray-800 text-white" : "text-gray-400"}`}>Grouped by day</span>
          </div>
          <div className="flex flex-wrap items-start gap-2 max-sm:basis-full">
            {["Import Expenses", "Export Expenses"].map((label) => (
              <span key={label} className="inline-flex min-h-10 items-center rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium motion-safe:animate-pulse">
                <span className="invisible">{label}</span>
              </span>
            ))}
          </div>
        </div>
        {grouped ? <GroupedHistorySkeleton /> : <TableHistorySkeleton />}
      </section>
    </>
  );
}
