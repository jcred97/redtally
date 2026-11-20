import Link from "next/link";
import { getLoans } from "@/app/lib/loans/queries";
import { getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount, sumCentavos } from "@/app/lib/expenses/money";
import LoanList, { type LoanListRow } from "./_components/LoanList";
import LoanPage, { LoanFacts, primaryAction } from "./_components/LoanPage";
import { PaymentHistory } from "./_components/LoanPayments";
import LoanTabs from "./_components/LoanTabs";
import { collectPayments, manilaDueWindow, summarizeInstallments } from "./_lib/display";

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const [{ view }, { cashLoans, plans }] = await Promise.all([searchParams, getLoans()]);
  const showList = view === "list";
  const rows: LoanListRow[] = [
    ...cashLoans.map((loan) => ({
      href: `/loans/cash/${loan.id}`,
      name: loan.title,
      provider: loan.lender,
      ...summarizeInstallments(loan.installments),
    })),
    ...plans.map((plan) => ({
      href: `/loans/plans/${plan.id}`,
      name: plan.expense.title,
      provider: plan.creditAccount.name,
      ...summarizeInstallments(plan.installments),
    })),
  ].sort((a, b) => (a.next?.dueDate.getTime() ?? Infinity) - (b.next?.dueDate.getTime() ?? Infinity) || a.name.localeCompare(b.name));
  const installments = [...cashLoans, ...plans].flatMap((record) => record.installments);
  const balances = summarizeInstallments(installments);
  const { start, end } = manilaDueWindow(getManilaToday());
  const overdue = balances.unpaid.filter(({ dueDate }) => dueDate < start);
  const dueSoon = balances.unpaid.filter(({ dueDate }) => dueDate >= start && dueDate < end);

  return (
    <LoanPage title="Loans">
      <LoanTabs
        current={showList ? "list" : "dashboard"}
        action={<Link href="/loans/new" className={`${primaryAction} hover:bg-red-600`}>Add Loan</Link>}
      />
      <div className="mt-5 space-y-4">
        {showList ? (
          <LoanList rows={rows} emptyMessage="No loans or financed purchases yet. Add a cash loan here or choose Pay Later when recording an expense." />
        ) : (
          <>
            <LoanFacts facts={[
              { label: "Total outstanding", value: formatPesoAmount(balances.outstanding) },
              { label: "Due in the next 7 days", value: formatPesoAmount(sumCentavos(dueSoon.map(({ balance }) => balance))) },
              { label: "Overdue", value: formatPesoAmount(sumCentavos(overdue.map(({ balance }) => balance))) },
            ]} />
            <section aria-labelledby="upcoming-loan-payments">
              <h2 id="upcoming-loan-payments" className="mb-2 text-lg font-semibold">Upcoming and Overdue Payments</h2>
              <LoanList rows={rows.filter(({ next }) => !!next).slice(0, 5)} emptyMessage="No upcoming payments." />
            </section>
            <PaymentHistory title="Recent Payments" payments={collectPayments(installments).slice(0, 5)} />
          </>
        )}
      </div>
    </LoanPage>
  );
}
