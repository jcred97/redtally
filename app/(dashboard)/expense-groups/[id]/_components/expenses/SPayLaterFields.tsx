"use client";

import { useId, useState } from "react";
import DateInput from "@/app/components/forms/DateInput";
import Select from "@/app/components/forms/Select";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount, parsePesoAmount } from "@/app/lib/expenses/money";
import { calculateSPayLaterSchedule } from "@/app/lib/pay-later/schedule";

const dueDayOptions = [
  { value: "", label: "Select a due day", disabled: true },
  { value: "5", label: "5th" },
  { value: "15", label: "15th" },
];

const paymentTermOptions = [
  { value: "", label: "Select a payment term", disabled: true },
  { value: "1", label: "Pay in full on first bill" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
];

function firstPayment(amount: string, completedOn: string, dueDay: string, months: string) {
  if (!amount || !dueDay || !months) return undefined;

  let amountCentavos;
  try {
    amountCentavos = parsePesoAmount(amount);
  } catch {
    // Incomplete or invalid amounts have no preview.
    return undefined;
  }

  return calculateSPayLaterSchedule({
    completedOn,
    dueDay: Number(dueDay),
    months: Number(months),
    amountCentavos,
  })?.[0];
}

export default function SPayLaterFields({ amount, expenseDate }: { amount: string; expenseDate: string }) {
  const fieldId = useId();
  const [dueDay, setDueDay] = useState("");
  const [months, setMonths] = useState("");
  const [completedOn, setCompletedOn] = useState("");
  const payment = firstPayment(amount, completedOn || expenseDate, dueDay, months);

  return (
    <>
      <div className="min-w-0">
        <label htmlFor={`${fieldId}-due-day`} className={fieldLabelClass}>Monthly due day</label>
        <Select
          id={`${fieldId}-due-day`}
          name="spayLaterDueDay"
          value={dueDay}
          onChange={setDueDay}
          options={dueDayOptions}
          required
        />
      </div>
      <div className="min-w-0">
        <label htmlFor={`${fieldId}-payment-term`} className={fieldLabelClass}>Payment term</label>
        <Select
          id={`${fieldId}-payment-term`}
          name="spayLaterMonths"
          value={months}
          onChange={setMonths}
          options={paymentTermOptions}
          required
        />
      </div>
      <div className="min-w-0">
        <label htmlFor={`${fieldId}-completed-on`} className={fieldLabelClass}>
          Order completed on <span aria-hidden="true" className="text-xs">(optional)</span>
        </label>
        <DateInput
          id={`${fieldId}-completed-on`}
          name="spayLaterCompletedOn"
          value={completedOn}
          onChange={(event) => setCompletedOn(event.target.value)}
          aria-describedby={`${fieldId}-completion-help`}
        />
        <p id={`${fieldId}-completion-help`} className="mt-1 text-xs text-gray-400">
          Leave blank to use the expense date.
        </p>
        <div role="status">
          {payment && (
            <div className="mt-4">
              <p className="text-sm font-medium">Estimated first payment</p>
              <p className="text-sm">{formatPesoAmount(payment.amountCentavos)} due {formatExpenseDate(payment.dueDate)}</p>
              <p className="mt-1 text-xs text-gray-400">Purchase amount only, before interest and fees.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
