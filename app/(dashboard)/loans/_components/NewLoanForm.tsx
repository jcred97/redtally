"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { createCashLoan, type LoanActionState } from "@/app/lib/loans/mutations";
import DateInput from "@/app/components/forms/DateInput";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { loanListHref } from "../_lib/display";
import { loanPanel, primaryAction, secondaryAction } from "./LoanPage";

const frequencies = [
  { value: "One-time", label: "One-time" },
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Other", label: "Other" },
];

export default function NewLoanForm({
  groups,
  today,
  submissionId,
}: {
  groups: { id: number; name: string }[];
  today: string;
  submissionId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [lender, setLender] = useState("");
  const [amount, setAmount] = useState("");
  const [disbursementDate, setDisbursementDate] = useState(today);
  const [receivingAccount, setReceivingAccount] = useState("");
  const [expenseGroupId, setExpenseGroupId] = useState("");
  const [frequency, setFrequency] = useState("One-time");
  const [installments, setInstallments] = useState<{ id: string; date: string; amount: string | null }[]>([{ id: "initial", date: "", amount: null }]);
  const [result, action, pending] = useActionState<LoanActionState, FormData>(async (previous, formData) => {
    const saved = await createCashLoan(previous, formData);
    if (saved.success && saved.id) router.replace(`/loans/cash/${saved.id}`);
    return saved;
  }, {});

  function changeInstallment(id: string, field: "date" | "amount", value: string) {
    setInstallments((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function addInstallment() {
    const id = crypto.randomUUID();
    setInstallments((current) => [...current, { id, date: "", amount: null }]);
  }

  return (
    <form action={action} className={`${loanPanel} mt-4 max-w-3xl`}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <fieldset disabled={pending || result.success} className="min-w-0 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 [&_label]:mb-1.5 [&_label]:block [&_label]:text-sm [&_label]:font-medium">
          <div>
            <label htmlFor="loan-title">Loan name</label>
            <TextInput id="loan-title" name="title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div>
            <label htmlFor="loan-lender">Lender</label>
            <TextInput id="loan-lender" name="lender" required maxLength={120} value={lender} onChange={(event) => setLender(event.target.value)} />
          </div>
          <div>
            <label htmlFor="loan-amount">Amount borrowed (₱)</label>
            <TextInput id="loan-amount" name="amount" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div>
            <label htmlFor="loan-disbursement">Disbursement date</label>
            <DateInput id="loan-disbursement" name="disbursementDate" required value={disbursementDate} onChange={(event) => setDisbursementDate(event.target.value)} />
          </div>
          <div>
            <label htmlFor="loan-account">Receiving account or wallet</label>
            <TextInput id="loan-account" name="receivingAccount" required maxLength={120} value={receivingAccount} onChange={(event) => setReceivingAccount(event.target.value)} />
          </div>
          <div>
            <label htmlFor="loan-group">Expense Group (optional)</label>
            <Select id="loan-group" name="expenseGroupId" value={expenseGroupId} onChange={setExpenseGroupId} options={[
              { value: "", label: "No expense group" },
              ...groups.map(({ id, name }) => ({ value: String(id), label: name })),
            ]} />
          </div>
          <div>
            <label htmlFor="loan-frequency">Repayment frequency</label>
            <Select id="loan-frequency" name="repaymentFrequency" value={frequency} onChange={setFrequency} options={frequencies.map((option) => ({
              ...option,
              disabled: option.value === "One-time" && installments.length > 1,
            }))} />
          </div>
        </div>

        <section aria-labelledby="loan-schedule" className="border-t border-gray-800 pt-4">
          <h2 id="loan-schedule" className="mb-3 font-semibold">Repayment schedule</h2>
          <div className="space-y-4">
            {installments.map(({ id, date, amount: installmentAmount }, index) => (
              <div key={id} className="grid grid-cols-2 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <div className="min-w-0">
                  <label htmlFor={`due-${id}`} className="mb-1.5 block text-sm font-medium">Due date {index + 1}</label>
                  <DateInput id={`due-${id}`} name="installmentDate" required min={disbursementDate} value={date} onChange={(event) => changeInstallment(id, "date", event.target.value)} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`amount-${id}`} className="mb-1.5 block text-sm font-medium">Amount {index + 1} (₱)</label>
                  <TextInput id={`amount-${id}`} name="installmentAmount" inputMode="decimal" required value={installmentAmount ?? (frequency === "One-time" ? amount : "")} onChange={(event) => changeInstallment(id, "amount", event.target.value)} />
                </div>
                {installments.length > 1 && (
                  <button type="button" className={`${secondaryAction} justify-self-start`} aria-label={`Remove installment ${index + 1}`} onClick={() => setInstallments((current) => current.filter((item) => item.id !== id))}>Remove</button>
                )}
              </div>
            ))}
          </div>
          {frequency !== "One-time" && <button type="button" className={`${secondaryAction} mt-3`} onClick={addInstallment}>Add installment</button>}
        </section>

        {result.error && <p role="alert" className="text-sm text-red-300">{result.error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={loanListHref} className={secondaryAction}>Cancel</Link>
          <button type="submit" className={primaryAction}>{pending ? "Saving…" : "Add Loan"}</button>
        </div>
      </fieldset>
    </form>
  );
}
