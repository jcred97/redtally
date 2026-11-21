import { notFound } from "next/navigation";
import { getRepaymentPlan } from "@/app/lib/loans/queries";
import { getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import LoanDetail from "../../_components/LoanDetail";
import LoanPage from "../../_components/LoanPage";

export default async function RepaymentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getRepaymentPlan(id);
  if (!plan) notFound();

  const { expense, creditAccount, installments } = plan;
  const group = expense.category.expenseGroup;
  const expenseHref = `/spending/${group.publicId}?allMonths=1&expense=${expense.id}#expense-history-title`;

  return (
    <LoanPage title={expense.title} back={{ href: expenseHref, label: "Back to Expense" }}>
      <LoanDetail
        title={expense.title}
        installments={installments}
        startDate={expense.date}
        today={getManilaToday()}
        facts={[
          { label: "Expense group", value: group.name },
          { label: "Purchase amount", value: formatPesoAmount(expense.amountCentavos) },
          { label: "Provider", value: creditAccount.name },
          { label: "Repayment type", value: installments.length === 1 ? "One-time" : "Installments" },
        ]}
      />
    </LoanPage>
  );
}
