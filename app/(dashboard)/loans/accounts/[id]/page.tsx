import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getCreditAccount } from "@/app/lib/loans/queries";
import { formatExpenseDate, getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount, sumCentavos } from "@/app/lib/expenses/money";
import LoanList from "../../_components/LoanList";
import LoanPage, { LoanFacts, primaryAction } from "../../_components/LoanPage";
import { PaymentHistory } from "../../_components/LoanPayments";
import RecordPaymentForm from "../../_components/RecordPaymentForm";
import { collectPayments, paymentFormId, summarizeInstallments } from "../../_lib/display";

export default async function CreditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getCreditAccount(id);
  if (!account) notFound();

  const rows = account.plans.map(({ id: planId, expense, installments }) => ({
    href: `/loans/plans/${planId}`,
    name: expense.title,
    provider: account.name,
    ...summarizeInstallments(installments),
  }));
  const installments = account.plans.flatMap((plan) => plan.installments);
  const payable = account.plans.flatMap((plan) => summarizeInstallments(plan.installments).unpaid.map(({ id: installmentId, dueDate, balance }) => ({
    id: installmentId,
    dueDate: dueDate.toISOString(),
    balance,
    name: plan.expense.title,
  }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  const nextBillDate = payable[0]?.dueDate;
  const nextBill = sumCentavos(payable.filter(({ dueDate }) => dueDate === nextBillDate).map(({ balance }) => balance));

  return (
    <LoanPage title={account.name} back={{ href: "/loans/accounts", label: "Back to Credit Accounts" }}>
      <div className="mt-4 space-y-4">
        <LoanFacts facts={[
          { label: "Total outstanding", value: formatPesoAmount(sumCentavos(rows.map(({ outstanding }) => outstanding))) },
          { label: "Next billed installments", value: nextBillDate ? `${formatPesoAmount(nextBill)} on ${formatExpenseDate(nextBillDate)}` : "No payments due" },
        ]} />
        {payable.length > 0 && <a href={`#${paymentFormId}`} className={`${primaryAction} hover:bg-red-600`}>Record Bill Payment</a>}
        <section aria-labelledby="credit-account-plans">
          <h2 id="credit-account-plans" className="mb-2 text-lg font-semibold">Financed Purchases</h2>
          <LoanList rows={rows} emptyMessage="No financed purchases on this account." />
        </section>
        <RecordPaymentForm bill installments={payable} today={getManilaToday()} submissionId={randomUUID()} />
        <PaymentHistory payments={collectPayments(installments)} />
      </div>
    </LoanPage>
  );
}
