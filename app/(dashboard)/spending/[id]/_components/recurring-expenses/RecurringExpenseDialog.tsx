"use client";

import { useId, useRef, useState } from "react";
import type { PaymentMethod } from "@/generated/prisma/enums";
import FormDialog from "@/app/components/dialogs/FormDialog";
import { formatPesoInput } from "@/app/lib/expenses/money";
import { paymentMethodLabels, type ExpenseBankOption } from "@/app/lib/expenses/payment";
import { recurrenceFrequencies, recurrenceFrequencyLabels } from "@/app/lib/expenses/recurrence";
import type { RecurringExpenseEntry } from "@/app/(dashboard)/_lib/recurring-expenses/access";
import { changeRecurringExpense } from "@/app/(dashboard)/_lib/recurring-expenses/mutations";
import Select from "@/app/components/forms/Select";
import DateInput from "@/app/components/forms/DateInput";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";

export type RecurringExpenseOptions = {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  banks: ExpenseBankOption[];
  today: string;
};

export default function RecurringExpenseDialog({
  expenseGroupId, categories, banks, today, rule,
}: RecurringExpenseOptions & { rule?: RecurringExpenseEntry }) {
  const fieldId = useId();
  const submissionId = useRef("");
  const bankFieldId = `${fieldId}-bank`;
  const [method, setMethod] = useState<PaymentMethod | "">(rule?.paymentMethod ?? "");
  const [bankId, setBankId] = useState(rule?.bankAssignmentId?.toString() ?? "");
  const eligibleBanks = banks.filter((bank) => bank.paymentMethods.some((value) => value === method));
  const unavailableBank = bankId !== "" && !eligibleBanks.some((bank) => String(bank.id) === bankId);

  function changeMethod(nextMethod: PaymentMethod | "") {
    setMethod(nextMethod);
    if (!banks.some((bank) => String(bank.id) === bankId && bank.paymentMethods.some((value) => value === nextMethod))) {
      setBankId("");
    }
  }

  return (
    <FormDialog
      triggerLabel={rule ? "Edit" : "+ New Recurring Expense"}
      triggerAriaLabel={rule ? `Edit recurring expense: ${rule.title}` : undefined}
      triggerVariant={rule ? "secondary" : "primary"}
      title={rule ? "Edit recurring expense" : "New recurring expense"}
      description={rule
        ? "Changes apply to future postings. Changing the frequency or start date recalculates the schedule from today."
        : "Expenses post on their scheduled dates. A past start date will add any missed expenses."}
      onOpenAction={() => {
        if (!rule) submissionId.current = crypto.randomUUID();
        setMethod(rule?.paymentMethod ?? "");
        setBankId(rule?.bankAssignmentId?.toString() ?? "");
      }}
      submitLabel={rule ? "Save changes" : "Create schedule"}
      pendingLabel="Saving..."
      pendingMessage="Saving recurring expense..."
      failureMessage="Unable to save the recurring expense. Please try again."
      submitAction={(data) => {
        if (!rule) data.set("submissionId", submissionId.current);
        return changeRecurringExpense(expenseGroupId, rule?.id ?? null, rule ? "edit" : "create", data);
      }}
    >
      <label className={`block ${fieldLabelClass}`}>
        Title
        <TextInput name="title" required maxLength={100} defaultValue={rule?.title} />
      </label>
      <label className={`block ${fieldLabelClass}`}>
        Amount (PHP)
        <TextInput name="amount" inputMode="decimal" required maxLength={20}
          defaultValue={rule ? formatPesoInput(rule.amountCentavos) : undefined} />
      </label>
      <div className={fieldLabelClass}>
        <label htmlFor={`${fieldId}-category`}>Category</label>
        <Select id={`${fieldId}-category`} name="categoryId" required defaultValue={rule?.categoryId ?? ""}
          options={[
            { value: "", label: "Select a category" },
            ...categories.map((category) => ({ value: String(category.id), label: category.name })),
          ]} />
      </div>
      <div className={fieldLabelClass}>
        <label htmlFor={`${fieldId}-frequency`}>Frequency</label>
        <Select id={`${fieldId}-frequency`} name="frequency" defaultValue={rule?.frequency ?? "MONTHLY"}
          options={recurrenceFrequencies.map((value) => ({ value, label: recurrenceFrequencyLabels[value] }))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={fieldLabelClass}>
          Start date
          <DateInput name="startDate" required defaultValue={rule?.startDate.toISOString().slice(0, 10) ?? today} />
        </label>
        <label className={fieldLabelClass}>
          End date (optional)
          <DateInput name="endDate" defaultValue={rule?.endDate?.toISOString().slice(0, 10)} />
        </label>
      </div>
      <div className={fieldLabelClass}>
        <label htmlFor={`${fieldId}-payment-method`}>Payment method</label>
        <Select id={`${fieldId}-payment-method`} name="paymentMethod" value={method}
          onChange={(value) => changeMethod(value as PaymentMethod | "")}
          options={[
            { value: "", label: "No payment method" },
            ...Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label })),
          ]} />
      </div>
      {(eligibleBanks.length > 0 || unavailableBank) && (
        <div className={fieldLabelClass}>
          <label htmlFor={bankFieldId}>Bank (optional)</label>
          <Select id={bankFieldId} name="bankAssignmentId" value={bankId} onChange={setBankId}
            aria-describedby={unavailableBank ? `${bankFieldId}-help` : undefined}
            options={[
              { value: "", label: "No bank" },
              ...(unavailableBank ? [{ value: bankId, label: `${rule?.bankAssignment?.bank.name} (unavailable)`, disabled: true }] : []),
              ...eligibleBanks.map((bank) => ({ value: String(bank.id), label: bank.name })),
            ]} />
          {unavailableBank && <span id={`${bankFieldId}-help`} className="mt-1 block text-xs text-gray-400">Choose an available bank or select No bank.</span>}
        </div>
      )}
    </FormDialog>
  );
}
