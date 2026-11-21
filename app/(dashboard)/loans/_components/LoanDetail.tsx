import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { collectPayments, paymentFormId, paymentLabel, summarizeInstallments, type Installment } from "../_lib/display";
import { LoanFacts, primaryAction } from "./LoanPage";
import { InstallmentSchedule, PaymentHistory } from "./LoanPayments";
import RecordPaymentForm from "./RecordPaymentForm";

export default function LoanDetail({
  title,
  installments,
  startDate,
  today,
  facts,
}: {
  title: string;
  installments: Installment[];
  startDate: Date;
  today: string;
  facts: { label: string; value: ReactNode }[];
}) {
  const { schedule, unpaid, outstanding, next } = summarizeInstallments(installments);
  const final = schedule.at(-1);
  const startDay = startDate.toISOString().slice(0, 10);
  const canRecordPayment = startDay <= today;

  return (
    <div className="mt-4 space-y-4">
      <LoanFacts facts={[
        ...facts,
        { label: "Outstanding", value: formatPesoAmount(outstanding) },
        { label: "Next payment", value: paymentLabel(next) },
        { label: "Term", value: `${schedule.length} ${schedule.length === 1 ? "payment" : "payments"}${final ? ` through ${formatExpenseDate(final.dueDate)}` : ""}` },
        { label: "Payments remaining", value: unpaid.length },
      ]} />
      {next && (canRecordPayment ? (
        <div className="flex flex-wrap gap-2">
          <a href={`#${paymentFormId}`} className={`${primaryAction} hover:bg-red-600`}>Record Payment</a>
        </div>
      ) : (
        <p className="text-sm text-gray-300">You can record a payment starting {formatExpenseDate(startDate)}.</p>
      ))}
      <InstallmentSchedule installments={installments} today={today} />
      <PaymentHistory payments={collectPayments(installments)} amountLabel="Applied Amount" />
      {canRecordPayment && (
        <RecordPaymentForm
          installments={unpaid.map(({ id, dueDate, balance }) => ({ id, dueDate: dueDate.toISOString(), balance, name: title }))}
          startDay={startDay}
          today={today}
          submissionId={randomUUID()}
        />
      )}
    </div>
  );
}
