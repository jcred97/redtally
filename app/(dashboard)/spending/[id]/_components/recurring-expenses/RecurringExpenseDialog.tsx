"use client";

import { useState } from "react";
import type { PaymentMethod } from "@/generated/prisma/enums";
import FormDialog from "@/app/components/dialogs/FormDialog";
import { formatPesoInput } from "@/app/lib/expenses/money";
import { paymentMethodLabels, type ExpenseBankOption } from "@/app/lib/expenses/payment";
import { recurrenceFrequencies, recurrenceFrequencyLabels } from "@/app/lib/expenses/recurrence";
import type { RecurringExpenseEntry } from "@/app/(dashboard)/_lib/recurring-expenses/access";
import { changeRecurringExpense } from "@/app/(dashboard)/_lib/recurring-expenses/mutations";
import Select from "@/app/components/forms/Select";
import DateInput from "@/app/components/forms/DateInput";

export type RecurringExpenseOptions = {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  banks: ExpenseBankOption[];
  today: string;
};

const inputClass = "mt-1.5 w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-white outline-none focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-60";

export default function RecurringExpenseDialog({
  expenseGroupId, categories, banks, today, rule,
}: RecurringExpenseOptions & { rule?: RecurringExpenseEntry }) {
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
        setMethod(rule?.paymentMethod ?? "");
        setBankId(rule?.bankAssignmentId?.toString() ?? "");
      }}
      submitLabel={rule ? "Save changes" : "Create schedule"}
      pendingLabel="Saving..."
      pendingMessage="Saving recurring expense..."
      failureMessage="Unable to save the recurring expense. Please try again."
      submitAction={(data) => changeRecurringExpense(expenseGroupId, rule?.id ?? null, rule ? "edit" : "create", data)}
    >
      <label className="block text-sm text-gray-300">
        Title
        <input name="title" required maxLength={100} defaultValue={rule?.title} className={inputClass} />
      </label>
      <label className="block text-sm text-gray-300">
        Amount (PHP)
        <input name="amount" type="text" inputMode="decimal" required maxLength={20}
          defaultValue={rule ? formatPesoInput(rule.amountCentavos) : undefined} className={inputClass} />
      </label>
      <label className="block text-sm text-gray-300">
        Category
        <Select name="categoryId" required defaultValue={rule?.categoryId ?? ""} className={inputClass}>
          <option value="">Select a category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
      </label>
      <label className="block text-sm text-gray-300">
        Frequency
        <Select name="frequency" defaultValue={rule?.frequency ?? "MONTHLY"} className={inputClass}>
          {recurrenceFrequencies.map((frequency) => (
            <option key={frequency} value={frequency}>{recurrenceFrequencyLabels[frequency]}</option>
          ))}
        </Select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0 text-sm text-gray-300">
          Start date
          <DateInput name="startDate" required defaultValue={rule?.startDate.toISOString().slice(0, 10) ?? today}
            className={inputClass} />
        </label>
        <label className="block min-w-0 text-sm text-gray-300">
          End date (optional)
          <DateInput name="endDate" defaultValue={rule?.endDate?.toISOString().slice(0, 10)}
            className={inputClass} />
        </label>
      </div>
      <label className="block text-sm text-gray-300">
        Payment method
        <Select name="paymentMethod" value={method} onChange={(event) => changeMethod(event.target.value as PaymentMethod | "")}
          className={inputClass}>
          <option value="">No payment method</option>
          {Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </label>
      {(eligibleBanks.length > 0 || unavailableBank) && (
        <label className="block text-sm text-gray-300">
          Bank (optional)
          <Select name="bankAssignmentId" value={bankId} onChange={(event) => setBankId(event.target.value)} className={inputClass}>
            <option value="">No bank</option>
            {unavailableBank && <option value={bankId}>{rule?.bankAssignment?.bank.name} (unavailable)</option>}
            {eligibleBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
          </Select>
          {unavailableBank && <span className="mt-1 block text-xs text-gray-400">Choose an available bank or select No bank.</span>}
        </label>
      )}
    </FormDialog>
  );
}
