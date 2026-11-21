"use client";

import { useId, useRef, useState } from "react";
import type { PaymentMethod } from "@/generated/prisma/enums";
import FormDialog from "@/app/components/dialogs/FormDialog";
import { formatPesoInput } from "@/app/lib/expenses/money";
import { isBankPaymentMethod, paymentMethodLabels, type ExpenseBankOption } from "@/app/lib/expenses/payment";
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
  const providerFieldId = `${fieldId}-payment-provider`;
  const [method, setMethod] = useState<PaymentMethod | "">(rule?.paymentMethod ?? "");
  const [bankId, setBankId] = useState(rule?.bankAssignmentId?.toString() ?? "");
  const usesBank = isBankPaymentMethod(method);
  const eligibleBanks = usesBank
    ? banks.filter((bank) => bank.paymentMethods.includes(method))
    : [];
  const unavailableBank = usesBank && bankId !== "" && !eligibleBanks.some((bank) => String(bank.id) === bankId);
  const providerOptions = usesBank ? [
    { value: "", label: "No bank" },
    ...(unavailableBank ? [{ value: bankId, label: `${rule?.bankAssignment?.bank.name ?? "Bank"} (unavailable)`, disabled: true }] : []),
    ...eligibleBanks.map(({ id, name }) => ({ value: String(id), label: name })),
  ] : [{ value: "", label: "No provider" }];

  function changeMethod(nextMethod: PaymentMethod | "") {
    if (nextMethod === method) return;
    setMethod(nextMethod);
    if (!isBankPaymentMethod(nextMethod) || !banks.some(
      (bank) => String(bank.id) === bankId && bank.paymentMethods.includes(nextMethod),
    )) {
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
      dialogSize="wide"
      compact
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
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="col-span-full min-w-0">
          <label htmlFor={`${fieldId}-title`} className={fieldLabelClass}>Title</label>
          <TextInput
            id={`${fieldId}-title`}
            name="title"
            required
            maxLength={100}
            defaultValue={rule?.title}
            placeholder="e.g. Internet bill"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-amount`} className={fieldLabelClass}>Amount (PHP)</label>
          <TextInput
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            required
            maxLength={20}
            defaultValue={rule ? formatPesoInput(rule.amountCentavos) : undefined}
            placeholder="150.75"
            aria-describedby={`${fieldId}-amount-help`}
          />
          <p id={`${fieldId}-amount-help`} className="sr-only mt-1 text-xs text-gray-400 md:not-sr-only">
            Up to two decimal places.
          </p>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-category`} className={fieldLabelClass}>Category</label>
          <Select
            id={`${fieldId}-category`}
            name="categoryId"
            required
            defaultValue={rule?.categoryId ?? categories[0]?.id ?? ""}
            options={[
              { value: "", label: "Select a category" },
              ...categories.map((category) => ({ value: String(category.id), label: category.name })),
            ]}
          />
        </div>
        <div className="col-span-full min-w-0">
          <label htmlFor={`${fieldId}-frequency`} className={fieldLabelClass}>Frequency</label>
          <Select
            id={`${fieldId}-frequency`}
            name="frequency"
            defaultValue={rule?.frequency ?? "MONTHLY"}
            options={recurrenceFrequencies.map((value) => ({ value, label: recurrenceFrequencyLabels[value] }))}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-start-date`} className={fieldLabelClass}>Start date</label>
          <DateInput
            id={`${fieldId}-start-date`}
            name="startDate"
            required
            defaultValue={rule?.startDate.toISOString().slice(0, 10) ?? today}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-end-date`} className={fieldLabelClass}>
            End date <span className="text-xs">(optional)</span>
          </label>
          <DateInput id={`${fieldId}-end-date`} name="endDate" defaultValue={rule?.endDate?.toISOString().slice(0, 10)} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-payment-method`} className={fieldLabelClass}>Payment Method</label>
          <Select
            id={`${fieldId}-payment-method`}
            name="paymentMethod"
            value={method}
            onChange={(value) => changeMethod(value as PaymentMethod | "")}
            options={[
              { value: "", label: "No payment method" },
              ...Object.entries(paymentMethodLabels)
                .filter(([value]) => value !== "PAY_LATER")
                .map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={providerFieldId} className={fieldLabelClass}>Payment Provider</label>
          <Select
            id={providerFieldId}
            name="bankAssignmentId"
            value={usesBank ? bankId : ""}
            onChange={setBankId}
            disabled={!usesBank}
            aria-describedby={unavailableBank ? `${providerFieldId}-help` : undefined}
            options={providerOptions}
          />
          {unavailableBank && (
            <p id={`${providerFieldId}-help`} className="mt-1 text-xs text-gray-400">Choose an available bank or select No bank.</p>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
