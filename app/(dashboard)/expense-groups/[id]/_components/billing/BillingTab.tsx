import Link from "next/link";
import type { ReactNode } from "react";
import { formatExpenseDate, getManilaToday, parseExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import type { Bill } from "../../_lib/billing/access";
import { expenseHistoryEntryHref } from "../../_lib/navigation";

function BillingDate({ date }: { date: Date }) {
  return <time dateTime={date.toISOString().slice(0, 10)}>{formatExpenseDate(date)}</time>;
}

function BillCard({ bill, open, expenseGroupPublicId }: { bill: Bill; open: boolean; expenseGroupPublicId: string }) {
  const { id, periodStart, periodEnd, dueDate, totalCentavos, installments } = bill;

  return (
    <article aria-labelledby={`bill-due-${id}`} className="rounded-xl border border-gray-800 bg-gray-900">
      <header className="p-4 pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h4 id={`bill-due-${id}`} className="text-base font-semibold">
            Due <BillingDate date={dueDate} />
          </h4>
          <p className="font-semibold tabular-nums">
            <span className="mr-1 text-sm font-normal text-gray-400">Estimated</span>{" "}
            <span>{formatPesoAmount(totalCentavos)}</span>
          </p>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Billing period <BillingDate date={periodStart} /> to <BillingDate date={periodEnd} />
        </p>
      </header>
      <details open={open} className="group">
        <summary className="mx-4 mb-1 w-fit cursor-pointer rounded-sm py-2 text-sm font-medium text-gray-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400">
          <span className="group-open:hidden">Show installments ({installments.length})</span>
          <span className="hidden group-open:inline">Hide installments ({installments.length})</span>
        </summary>
        <ul role="list" className="divide-y divide-gray-800 border-t border-gray-800">
          {installments.map(({ id, installmentNumber, amountCentavos, expense }) => (
            <li key={id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link
                  href={expenseHistoryEntryHref(expenseGroupPublicId, expense.id)}
                  prefetch={false}
                  className="wrap-anywhere rounded-sm font-medium text-red-400 underline underline-offset-2 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                >
                  {expense.title}
                </Link>
                <p className="mt-0.5 text-gray-400">
                  Installment {installmentNumber}{expense.spayLaterMonths !== null && ` of ${expense.spayLaterMonths}`}
                </p>
              </div>
              <p className="font-semibold tabular-nums">{formatPesoAmount(amountCentavos)}</p>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export default function BillingTab({ bills, expenseGroupPublicId, emptyState }: {
  bills: Bill[];
  expenseGroupPublicId: string;
  emptyState: ReactNode;
}) {
  const today = parseExpenseDate(getManilaToday());
  const upcoming = bills.filter((bill) => bill.dueDate >= today);
  const past = bills.filter((bill) => bill.dueDate < today).reverse();

  return (
    <section aria-labelledby="billing-title">
      <h2 id="billing-title" tabIndex={-1} className="mb-4 text-lg font-semibold">Billing</h2>
      {bills.length === 0 ? (
        emptyState
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-gray-400">Purchase amount only, before interest and fees.</p>
          <section aria-labelledby="upcoming-bills">
            <h3 id="upcoming-bills" className="mb-3 text-base font-semibold">Upcoming bills</h3>
            {upcoming.length > 0 ? (
              <div className="space-y-3">
                {upcoming.map((bill, index) => <BillCard key={bill.id} bill={bill} open={index === 0} expenseGroupPublicId={expenseGroupPublicId} />)}
              </div>
            ) : (
              <p className="text-sm text-gray-300">No upcoming bills.</p>
            )}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-bills">
              <h3 id="past-bills" className="mb-3 text-base font-semibold">Past scheduled bills</h3>
              <div className="space-y-3">
                {past.map((bill) => <BillCard key={bill.id} bill={bill} open={false} expenseGroupPublicId={expenseGroupPublicId} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
