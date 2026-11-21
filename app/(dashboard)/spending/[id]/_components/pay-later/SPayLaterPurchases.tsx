import Link from "next/link";
import { InstallmentSchedule } from "@/app/(dashboard)/loans/_components/LoanPayments";
import { loanLink, loanPanel } from "@/app/(dashboard)/loans/_components/LoanPage";
import { summarizeInstallments } from "@/app/(dashboard)/loans/_lib/display";
import { formatExpenseDate, getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import type { getGroupSPayLaterPurchases } from "@/app/lib/loans/queries";

export default function SPayLaterPurchases({
  purchases,
}: {
  purchases: Awaited<ReturnType<typeof getGroupSPayLaterPurchases>>;
}) {
  const today = getManilaToday();

  return (
    <section aria-labelledby="spaylater-purchases-title" className="space-y-4">
      <h2 id="spaylater-purchases-title" className="text-lg font-semibold">SPayLater Purchases</h2>
      {purchases.length === 0 ? (
        <p className={`${loanPanel} text-sm text-gray-400`}>No SPayLater purchases in this expense group.</p>
      ) : (
        <ul className="space-y-4">
          {purchases.map(({ id, expense, installments }) => {
            const { outstanding } = summarizeInstallments(installments);

            return (
              <li key={id} className="rounded-xl border border-gray-800 bg-gray-900/45">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:px-5">
                  <div className="min-w-0">
                    <h3 className="wrap-anywhere font-semibold">{expense.title}</h3>
                    <p className="mt-1 text-sm text-gray-400">
                      {formatExpenseDate(expense.date)} · {formatPesoAmount(expense.amountCentavos)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <dl className="text-sm">
                      <dt className="text-gray-400">Outstanding</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{formatPesoAmount(outstanding)}</dd>
                    </dl>
                    <Link href={`/loans/plans/${id}`} aria-label={`View plan for ${expense.title}`} className={`${loanLink} inline-flex min-h-10 items-center px-1 text-sm font-medium`}>
                      View plan
                    </Link>
                  </div>
                </div>
                <InstallmentSchedule installments={installments} today={today} embedded />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
