import Link from "next/link";
import { creditAccountHref } from "@/app/lib/loans/credit-account-links";
import { formatExpenseDate, getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount, sumCentavos } from "@/app/lib/expenses/money";
import { LoanFacts, loanLink, loanPanel } from "@/app/(dashboard)/loans/_components/LoanPage";
import { manilaDueWindow, summarizeInstallments, type Installment } from "@/app/(dashboard)/loans/_lib/display";

type CreditAccount = {
  id: string;
  name: string;
  plans: { installments: Installment[] }[];
};

export default function PayLaterSummary({ accounts }: { accounts: CreditAccount[] }) {
  const { start, end } = manilaDueWindow(getManilaToday());
  const today = start.getTime();
  const weekEnd = end.getTime();
  const bills = accounts.flatMap((account) => {
    const { unpaid } = summarizeInstallments(account.plans.flatMap((plan) => plan.installments));
    const billsByDate = new Map<number, number>();
    for (const { dueDate, balance } of unpaid) {
      const date = dueDate.getTime();
      billsByDate.set(date, (billsByDate.get(date) ?? 0) + balance);
    }
    return [...billsByDate].map(([dueAt, balance]) => ({ id: account.id, name: account.name, dueAt, balance }));
  }).sort((a, b) => a.dueAt - b.dueAt || a.name.localeCompare(b.name));

  const overdue = bills.filter(({ dueAt }) => dueAt < today);
  const dueSoon = bills.filter(({ dueAt }) => dueAt >= today && dueAt < weekEnd);

  return (
    <section aria-labelledby="pay-later-title" className="space-y-4">
      <h2 id="pay-later-title" className="text-lg font-semibold">Pay Later across all expense groups</h2>
      <LoanFacts facts={[
        { label: "Total outstanding", value: formatPesoAmount(sumCentavos(bills.map(({ balance }) => balance))) },
        { label: "Due in the next 7 days", value: formatPesoAmount(sumCentavos(dueSoon.map(({ balance }) => balance))) },
        { label: "Overdue", value: formatPesoAmount(sumCentavos(overdue.map(({ balance }) => balance))) },
      ]} />
      <section aria-labelledby="pay-later-bills-title">
        <h3 id="pay-later-bills-title" className="mb-2 font-semibold">Upcoming and overdue bills</h3>
        {bills.length ? (
          <ul className={`${loanPanel} divide-y divide-gray-800`}>
            {bills.map(({ id, name, dueAt, balance }) => (
              <li key={`${id}:${dueAt}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={creditAccountHref(id)} className={`${loanLink} wrap-anywhere font-medium`}>{name}</Link>
                  <p className={dueAt < today ? "text-red-300" : "text-gray-400"}>
                    {dueAt < today ? "Overdue since " : "Due "}{formatExpenseDate(new Date(dueAt))}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatPesoAmount(balance)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${loanPanel} text-sm text-gray-400`}>No upcoming or overdue Pay Later bills.</p>
        )}
      </section>
    </section>
  );
}
