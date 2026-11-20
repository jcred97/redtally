import Link from "next/link";
import { notFound } from "next/navigation";
import { getCashLoan } from "@/app/lib/loans/queries";
import { formatExpenseDate, getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import LoanDetail from "../../_components/LoanDetail";
import LoanPage, { backToLoanList, loanLink } from "../../_components/LoanPage";

export default async function CashLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loan = await getCashLoan(id);
  if (!loan) notFound();

  return (
    <LoanPage title={loan.title} back={backToLoanList}>
      <LoanDetail title={loan.title} installments={loan.installments} today={getManilaToday()} facts={[
        { label: "Lender", value: loan.lender },
        { label: "Amount borrowed", value: formatPesoAmount(loan.amountCentavos) },
        { label: "Disbursement date", value: formatExpenseDate(loan.disbursementDate) },
        { label: "Receiving account", value: loan.receivingAccount },
        { label: "Repayment frequency", value: loan.repaymentFrequency ?? "Custom schedule" },
        ...(loan.expenseGroup ? [{
          label: "Expense Group",
          value: <Link href={`/spending/${loan.expenseGroup.publicId}`} className={loanLink}>{loan.expenseGroup.name}</Link>,
        }] : []),
      ]} />
    </LoanPage>
  );
}
