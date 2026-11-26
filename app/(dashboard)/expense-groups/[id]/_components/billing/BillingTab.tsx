import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import type { BillingCycle } from "../../_lib/billing/access";

function BillingDate({ date }: { date: Date }) {
  return <time dateTime={date.toISOString().slice(0, 10)}>{formatExpenseDate(date)}</time>;
}

export default function BillingTab({ cycles }: { cycles: BillingCycle[] }) {
  return (
    <section aria-labelledby="billing-title">
      <h2 id="billing-title" className="mb-4 text-lg font-semibold">Billing</h2>
      {cycles.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <p className="text-sm font-medium text-gray-300">No bills yet</p>
          <p className="mt-1 text-sm text-gray-400">Save an SPayLater expense to start a billing schedule.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {cycles.map(({ dueDay, bills }) => (
            <section key={dueDay} aria-labelledby={`billing-cycle-${dueDay}`}>
              <h3 id={`billing-cycle-${dueDay}`} className="mb-3 text-base font-semibold">
                Due on the {dueDay === 5 ? "5th" : "15th"}
              </h3>
              <div className="space-y-3">
                {bills.map(({ id, periodStart, periodEnd, dueDate, totalCentavos, installments }) => (
                  <article key={id} aria-labelledby={`billing-period-${id}`} className="rounded-xl border border-gray-800 bg-gray-900">
                    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-4">
                      <div>
                        <h4 id={`billing-period-${id}`} className="text-sm font-semibold">
                          <BillingDate date={periodStart} /> to <BillingDate date={periodEnd} />
                        </h4>
                        <p className="mt-1 text-sm text-gray-300">Due <BillingDate date={dueDate} /></p>
                      </div>
                      <dl>
                        <dt className="text-sm text-gray-400">Estimated principal total</dt>
                        <dd className="mt-1 text-sm font-semibold tabular-nums">{formatPesoAmount(totalCentavos)}</dd>
                      </dl>
                    </header>
                    <ul role="list" className="divide-y divide-gray-800 border-t border-gray-800">
                      {installments.map(({ id, installmentNumber, amountCentavos, expense }) => (
                        <li key={id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <p className="wrap-anywhere font-medium">{expense.title}</p>
                            <p className="mt-0.5 text-gray-400">
                              Installment {installmentNumber}{expense.spayLaterMonths !== null && ` of ${expense.spayLaterMonths}`}
                            </p>
                          </div>
                          <p className="font-semibold tabular-nums">{formatPesoAmount(amountCentavos)}</p>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
