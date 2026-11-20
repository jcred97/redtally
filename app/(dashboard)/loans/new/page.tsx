import { randomUUID } from "node:crypto";
import { getExpenseGroupOptions } from "@/app/(dashboard)/_lib/expense-groups/queries";
import { getManilaToday } from "@/app/lib/expenses/date";
import LoanPage, { backToLoanList } from "../_components/LoanPage";
import NewLoanForm from "../_components/NewLoanForm";

export default async function NewLoanPage() {
  const groups = await getExpenseGroupOptions();
  return (
    <LoanPage title="Add Loan" back={backToLoanList}>
      <NewLoanForm groups={groups} today={getManilaToday()} submissionId={randomUUID()} />
    </LoanPage>
  );
}
