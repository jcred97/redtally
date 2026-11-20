import Link from "next/link";
import { getCashLoans } from "@/app/lib/loans/queries";
import { getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount, sumCentavos } from "@/app/lib/expenses/money";
import LoanList, { type LoanListRow } from "./_components/LoanList";
import LoanPage, { LoanFacts, primaryAction } from "./_components/LoanPage";
import { PaymentHistory } from "./_components/LoanPayments";
import { collectPayments, manilaDueWindow, summarizeInstallments } from "./_lib/display";

export default async function LoansPage() {
  const cashLoans = await getCashLoans();
  const rows: LoanListRow[] = cashLoans
    .map((loan) => ({
      href: `/loans/cash/${loan.id}`,
      name: loan.title,
      provider: loan.lender,
      ...summarizeInstallments(loan.installments),
    }))
    .sort((a, b) => (a.next?.dueDate.getTime() ?? Infinity) - (b.next?.dueDate.getTime() ?? Infinity) || a.name.localeCompare(b.name));
  const installments = cashLoans.flatMap((loan) => loan.installments);
  const { outstanding, unpaid } = summarizeInstallments(installments);
  const { start, end } = manilaDueWindow(getManilaToday());
  const overdue = unpaid.filter(({ dueDate }) => dueDate < start);
  const dueSoon = unpaid.filter(({ dueDate }) => dueDate >= start && dueDate < end);
  const recentPayments = collectPayments(installments).slice(0, 5);

  return (
    <LoanPage
      title="Loans"
      action={<Link href="/loans/new" className={`${primaryAction} hover:bg-red-600`}>Add Loan</Link>}
    >
      <div className="mt-5 space-y-4">
        {rows.length > 0 && (
          <LoanFacts facts={[
            { label: "Total outstanding", value: formatPesoAmount(outstanding) },
            { label: "Due in the next 7 days", value: formatPesoAmount(sumCentavos(dueSoon.map(({ balance }) => balance))) },
            { label: "Overdue", value: formatPesoAmount(sumCentavos(overdue.map(({ balance }) => balance))) },
          ]} />
        )}
        <LoanList rows={rows} caption="Cash loans" providerLabel="Lender" emptyMessage="No cash loans yet." />
        {recentPayments.length > 0 && <PaymentHistory title="Recent Payments" payments={recentPayments} />}
      </div>
    </LoanPage>
  );
}
