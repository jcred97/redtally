import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepaymentPlan } from "@/app/lib/loans/queries";
import { getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import LoanDetail from "../../_components/LoanDetail";
import LoanPage, { backToLoanList, loanLink, secondaryAction } from "../../_components/LoanPage";
import { paymentFormId } from "../../_lib/display";

export default async function RepaymentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getRepaymentPlan(id);
  if (!plan) notFound();

  const { expense, creditAccount, installments } = plan;
  const group = expense.category.expenseGroup;
  const accountHref = `/loans/accounts/${creditAccount.id}`;
  const expenseHref = `/spending/${group.publicId}?allMonths=1&expense=${expense.id}#expense-history-title`;

  return (
    <LoanPage title={expense.title} back={backToLoanList}>
      <LoanDetail
        title={expense.title}
        installments={installments}
        today={getManilaToday()}
        facts={[
          { label: "Original expense", value: <Link href={expenseHref} className={loanLink}>{expense.title} · {group.name}</Link> },
          { label: "Purchase amount", value: formatPesoAmount(expense.amountCentavos) },
          { label: "Credit account", value: <Link href={accountHref} className={loanLink}>{creditAccount.name}</Link> },
          { label: "Repayment type", value: installments.length === 1 ? "One-time" : "Installments" },
        ]}
        paymentAccountLink={<Link href={`${accountHref}#${paymentFormId}`} className={secondaryAction}>Record Shared Bill Payment</Link>}
      />
    </LoanPage>
  );
}
