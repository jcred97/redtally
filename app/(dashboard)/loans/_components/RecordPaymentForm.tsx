"use client";

import { useActionState, useState } from "react";
import { recordLoanPayment, type LoanActionState } from "@/app/lib/loans/mutations";
import DateInput from "@/app/components/forms/DateInput";
import TextInput from "@/app/components/forms/TextInput";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount, formatPesoInput, MAX_AMOUNT_CENTAVOS, parsePesoAmount } from "@/app/lib/expenses/money";
import { paymentFormId } from "../_lib/display";
import { loanPanel, primaryAction, secondaryAction } from "./LoanPage";

export type PayableInstallment = {
  id: string;
  dueDate: string;
  balance: number;
  name: string;
};

export default function RecordPaymentForm({
  installments,
  startDay,
  today,
  submissionId,
}: {
  installments: PayableInstallment[];
  startDay: string;
  today: string;
  submissionId: string;
}) {
  const [requestId, setRequestId] = useState(submissionId);
  const [paidOn, setPaidOn] = useState(today);
  const [fundingAccount, setFundingAccount] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const next = installments[0];
    return next ? { [next.id]: formatPesoInput(next.balance) } : {};
  });
  const [result, action, pending] = useActionState<LoanActionState, FormData>(async (previous, formData) => {
    const ids = formData.getAll("installmentId");
    const allocations = formData.getAll("allocationAmount");
    formData.delete("installmentId");
    formData.delete("allocationAmount");
    allocations.forEach((value, index) => {
      if (typeof value === "string" && value.trim()) {
        formData.append("installmentId", ids[index]);
        formData.append("allocationAmount", value);
      }
    });
    const saved = await recordLoanPayment(previous, formData);
    if (saved.success) {
      setRequestId(crypto.randomUUID());
      setAmounts({});
    }
    return saved;
  }, {});

  const allocationInputs = installments.map((installment) => {
    const value = amounts[installment.id] ?? "";
    let centavos = 0;
    let invalid = false;
    if (value) {
      try {
        centavos = parsePesoAmount(value);
        invalid = centavos > installment.balance;
      } catch {
        invalid = true;
      }
    }
    return { ...installment, value, centavos, invalid };
  });
  const total = allocationInputs.reduce((sum, allocation) => sum + allocation.centavos, 0);
  const valid = total > 0 && total <= MAX_AMOUNT_CENTAVOS && allocationInputs.every(({ invalid }) => !invalid);

  if (installments.length === 0 && !result.success) return null;

  return (
    <section id={paymentFormId} aria-labelledby="record-loan-payment" className={loanPanel}>
      <h2 id="record-loan-payment" className="text-lg font-semibold">Record Payment</h2>
      {result.success && <p role="status" className="mt-2 text-sm text-green-300">Payment recorded.</p>}
      {installments.length > 0 && (
        <form action={action} className="mt-3">
          <input type="hidden" name="submissionId" value={requestId} />
          <input type="hidden" name="amount" value={valid ? formatPesoInput(total) : ""} />
          <fieldset className="min-w-0 space-y-4" disabled={pending}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="loan-paid-on" className="mb-1.5 block text-sm font-medium">Payment date</label>
                <DateInput id="loan-paid-on" name="paidOn" required min={startDay} max={today} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
              </div>
              <div>
                <label htmlFor="loan-funding-account" className="mb-1.5 block text-sm font-medium">Paid from</label>
                <TextInput id="loan-funding-account" name="fundingAccount" placeholder="Bank account or wallet" maxLength={120} required value={fundingAccount} onChange={(event) => setFundingAccount(event.target.value)} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-gray-300">Enter the amount applied to each installment. Leave the other amounts blank.</p>
              <ul className="divide-y divide-gray-800 rounded-lg border border-gray-800">
                {allocationInputs.map(({ id, dueDate, balance, name, value, invalid }) => (
                  <li key={id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                    <input type="hidden" name="installmentId" value={id} />
                    <div className="wrap-anywhere text-sm">
                      <label htmlFor={`allocation-${id}`} className="font-medium">{name}<span className="sr-only"> applied amount</span></label>
                      <p className="text-xs text-gray-400">{formatExpenseDate(dueDate)} · {formatPesoAmount(balance)} due</p>
                    </div>
                    <TextInput id={`allocation-${id}`} name="allocationAmount" className="min-w-0" inputMode="decimal" placeholder="Amount (₱)" value={value} aria-invalid={invalid || undefined} onChange={(event) => setAmounts((current) => ({ ...current, [id]: event.target.value }))} />
                    <button type="button" className={`${secondaryAction} col-start-2 justify-self-start sm:col-start-auto`} aria-label={`Use full amount for ${name} due ${formatExpenseDate(dueDate)}`} onClick={() => setAmounts((current) => ({ ...current, [id]: formatPesoInput(balance) }))}>Use full</button>
                  </li>
                ))}
              </ul>
            </div>
            {allocationInputs.some(({ invalid }) => invalid) && <p className="text-sm text-red-300">Enter a valid amount that does not exceed the installment balance.</p>}
            {total > MAX_AMOUNT_CENTAVOS && <p className="text-sm text-red-300">The payment exceeds the maximum supported amount.</p>}
            {result.error && <p role="alert" className="text-sm text-red-300">{result.error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="text-sm text-gray-300">Payment total <strong className="font-semibold text-white">{formatPesoAmount(total)}</strong></p>
              <button type="submit" className={primaryAction} disabled={!valid || pending}>{pending ? "Recording…" : "Record Payment"}</button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
