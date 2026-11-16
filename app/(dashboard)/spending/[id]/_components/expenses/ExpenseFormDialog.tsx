"use client";

import { useId, useRef, useState } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import {
  createExpense,
  updateExpense,
} from "@/app/(dashboard)/_lib/expenses/mutations";
import { expenseTimeInput, getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoInput } from "@/app/lib/expenses/money";
import { paymentMethodLabels, type ExpenseBankOption } from "@/app/lib/expenses/payment";
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { ReceiptSuggestions } from "../../_lib/receipt-fields";
import ReceiptImageInput from "./ReceiptImageInput";

export type EditableExpense = {
  id: number;
  title: string;
  amountCentavos: number;
  date: string;
  timeMinutes: number | null;
  updatedAt: string;
  categoryId: number;
  paymentMethod: PaymentMethod | null;
  bankAssignmentId: number | null;
  bankName: string | null;
};

type ExpenseFormDialogProps = {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  expense?: EditableExpense;
  menuFocusKey?: string;
};

export default function ExpenseFormDialog({
  expenseGroupId,
  categories,
  bankOptions,
  expense,
  menuFocusKey,
}: ExpenseFormDialogProps) {
  const fieldId = useId();
  const submissionId = useRef("");
  const expectedUpdatedAt = useRef("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [bankAssignmentId, setBankAssignmentId] = useState("");
  const hasCategories = categories.length > 0;
  const canSelectBank = paymentMethod !== "" && paymentMethod !== "CASH";
  const eligibleBanks = canSelectBank
    ? bankOptions.filter((bank) => bank.paymentMethods.includes(paymentMethod))
    : [];
  const bankHelp = paymentMethod === ""
    ? "Select a method first."
    : paymentMethod === "CASH"
      ? "Unavailable for cash."
      : eligibleBanks.length === 0
        ? "Enable a bank for this payment method in the Banks tab."
        : null;
  const hasRecordedBank =
    expense?.bankName != null &&
    paymentMethod === (expense.paymentMethod ?? "") &&
    bankAssignmentId === String(expense.bankAssignmentId ?? "");
  const showUnavailableBank =
    hasRecordedBank &&
    bankAssignmentId !== "" &&
    !eligibleBanks.some((bank) => String(bank.id) === bankAssignmentId);

  function resetFields() {
    if (expense) {
      expectedUpdatedAt.current = expense.updatedAt;
      setTitle(expense.title);
      setAmount(formatPesoInput(expense.amountCentavos));
      setDate(expense.date.slice(0, 10));
      setTime(expenseTimeInput(expense.timeMinutes));
      setCategoryId(String(expense.categoryId));
      setPaymentMethod(expense.paymentMethod ?? "");
      setBankAssignmentId(String(expense.bankAssignmentId ?? ""));
    } else {
      submissionId.current = crypto.randomUUID();
      setTitle("");
      setAmount("");
      setDate(getManilaToday());
      setTime("");
      setCategoryId(String(categories[0]?.id ?? ""));
      setPaymentMethod("");
      setBankAssignmentId("");
    }
  }

  function changePaymentMethod(method: PaymentMethod | "") {
    setPaymentMethod(method);
    if (
      method === "" ||
      method === "CASH" ||
      !bankOptions.some(
        (bank) => String(bank.id) === bankAssignmentId && bank.paymentMethods.includes(method)
      )
    ) {
      setBankAssignmentId("");
    }
  }

  function applyReceiptSuggestion(field: keyof ReceiptSuggestions, value: string) {
    switch (field) {
      case "title":
        setTitle(value);
        break;
      case "amount":
        setAmount(value);
        break;
      case "date":
        setDate(value);
        break;
      case "time":
        setTime(value);
        break;
    }
  }

  async function saveExpenseInGroup(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    formData.set("paymentMethod", paymentMethod);
    formData.set("bankAssignmentId", bankAssignmentId);

    if (expense) {
      formData.set("expenseId", String(expense.id));
      formData.set("expectedUpdatedAt", expectedUpdatedAt.current);

      return updateExpense(null, formData);
    }

    formData.set("submissionId", submissionId.current);
    return createExpense(null, formData);
  }

  const inputClass =
    "mt-0.5 min-h-10 w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-white outline-none focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-1 sm:px-3 sm:py-2";
  const labelClass = "block text-sm leading-tight text-gray-400";

  return (
    <div>
      <FormDialog
        triggerLabel={expense ? "Edit" : "+ New Expense"}
        triggerAriaLabel={expense ? `Edit expense: ${expense.title}` : undefined}
        triggerFocusKey={menuFocusKey ?? (expense ? `expense-${expense.id}` : undefined)}
        triggerVariant={expense ? "secondary" : "primary"}
        triggerClassName={menuFocusKey ? "w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-red-400" : undefined}
        returnFocusId={menuFocusKey ? "expense-history-title" : undefined}
        title={expense ? "Edit Expense" : "New Expense"}
        dialogSize="wide"
        compact
        pendingMessage="Saving your expense. Please wait..."
        failureMessage="Unable to save your expense. Please try again."
        submitLabel={expense ? "Save changes" : "Save expense"}
        pendingLabel="Saving..."
        disabled={!hasCategories}
        onOpenAction={resetFields}
        submitAction={saveExpenseInGroup}
      >
        <div className={`grid items-start gap-2.5 md:gap-4 ${expense ? "" : "md:grid-cols-2"}`}>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 sm:gap-x-3 sm:gap-y-3">
            <div className="col-span-2 min-w-0">
              <label htmlFor={`${fieldId}-title`} className={labelClass}>Title</label>
              <input
                id={`${fieldId}-title`}
                name="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Lunch"
                className={inputClass}
              />
            </div>

            <div className="min-w-0">
              <label htmlFor={`${fieldId}-amount`} className={labelClass}>Amount (PHP)</label>
              <input
                id={`${fieldId}-amount`}
                name="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                maxLength={20}
                placeholder="150.75"
                aria-describedby={`${fieldId}-amount-help`}
                className={inputClass}
              />
              <p id={`${fieldId}-amount-help`} className="sr-only mt-1 text-xs text-gray-400 md:not-sr-only">Up to two decimal places.</p>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${fieldId}-category`} className={labelClass}>Category</label>
              <select
                id={`${fieldId}-category`}
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
                className={inputClass}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label htmlFor={`${fieldId}-date`} className={labelClass}>Date</label>
              <input
                id={`${fieldId}-date`}
                name="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${fieldId}-time`} className={labelClass}>
                Time <span className="text-xs">(Manila, optional)</span>
              </label>
              <input
                id={`${fieldId}-time`}
                name="time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className={inputClass}
              />
            </div>

            <div className="col-span-2 grid grid-cols-[minmax(12.5rem,1.3fr)_minmax(0,1fr)] items-start gap-x-2.5 sm:gap-x-3">
              <div className="min-w-0">
                <label htmlFor={`${fieldId}-payment-method`} className={labelClass}>Payment method</label>
                <div className="relative">
                  <select
                    id={`${fieldId}-payment-method`}
                    name="paymentMethod"
                    value={paymentMethod}
                    onChange={(event) => changePaymentMethod(event.target.value as PaymentMethod | "")}
                    className={`${inputClass} appearance-none pr-7 sm:pr-7`}
                  >
                    <option value="">No payment method</option>
                    {Object.entries(paymentMethodLabels).map(([method, label]) => (
                      <option key={method} value={method}>{label}</option>
                    ))}
                  </select>
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-1.5 -translate-y-1/2 rotate-45 border-r-2 border-b-2 border-current" />
                </div>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${fieldId}-bank`} className={labelClass}>
                  Bank <span className="text-xs">(optional)</span>
                </label>
                <select
                  id={`${fieldId}-bank`}
                  name="bankAssignmentId"
                  value={bankAssignmentId}
                  onChange={(event) => setBankAssignmentId(event.target.value)}
                  disabled={!canSelectBank}
                  aria-describedby={bankHelp ? `${fieldId}-bank-help` : undefined}
                  className={inputClass}
                >
                  <option value="">No bank</option>
                  {showUnavailableBank && (
                    <option value={bankAssignmentId} disabled>{expense?.bankName} (previously selected)</option>
                  )}
                  {eligibleBanks.map((bank) => (
                    <option key={bank.id} value={bank.id}>{bank.name}</option>
                  ))}
                </select>
              </div>
              {bankHelp && <p id={`${fieldId}-bank-help`} className="col-span-2 mt-1 text-xs text-gray-400">{bankHelp}</p>}
            </div>
            {hasRecordedBank && (!canSelectBank || bankAssignmentId === "") && (
              <p className="col-span-2 wrap-anywhere text-sm text-gray-400">Recorded bank: {expense?.bankName}</p>
            )}
          </div>

          {!expense && <ReceiptImageInput onApply={applyReceiptSuggestion} />}
        </div>
      </FormDialog>

      {!hasCategories && (
        <p className="mt-1 text-xs text-gray-400">Create a category first.</p>
      )}
    </div>
  );
}
