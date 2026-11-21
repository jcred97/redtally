"use client";

import { useId, useRef, useState } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import menuStyles from "@/app/components/menus/action-menu.module.css";
import DateInput from "@/app/components/forms/DateInput";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import {
  createExpense,
  updateExpense,
} from "@/app/(dashboard)/_lib/expenses/mutations";
import { expenseTimeInput, getManilaToday } from "@/app/lib/expenses/date";
import { formatPesoInput } from "@/app/lib/expenses/money";
import { isBankPaymentMethod, isPaymentMethod, paymentMethodLabels, type ExpenseBankOption } from "@/app/lib/expenses/payment";
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { ReceiptSuggestions } from "@/app/lib/receipt-scanning/config";
import ReceiptImageInput from "./ReceiptImageInput";
import CreditAccountFields, { type CreditAccountOption } from "./CreditAccountFields";
import FinancedPurchaseFields from "./FinancedPurchaseFields";

export type EditableExpense = {
  id: number;
  title: string;
  merchant: string | null;
  amountCentavos: number;
  date: string;
  timeMinutes: number | null;
  updatedAt: string;
  categoryId: number;
  paymentMethod: PaymentMethod | null;
  bankAssignmentId: number | null;
  bankName: string | null;
  repaymentPlanId?: string | null;
};

type ExpenseFormDialogProps = {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  creditAccounts?: CreditAccountOption[];
  expense?: EditableExpense;
  focusKey?: string;
  inMenu?: boolean;
};

export default function ExpenseFormDialog({
  expenseGroupId,
  categories,
  bankOptions,
  creditAccounts = [],
  expense,
  focusKey,
  inMenu,
}: ExpenseFormDialogProps) {
  const fieldId = useId();
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const submissionId = useRef("");
  const expectedUpdatedAt = useRef("");
  const [title, setTitle] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [bankAssignmentId, setBankAssignmentId] = useState("");
  const hasCategories = categories.length > 0;
  const financed = paymentMethod === "PAY_LATER";
  const showSchedule = !expense && financed;
  const hasRepaymentPlan = Boolean(expense?.repaymentPlanId);
  const canSelectBank = isBankPaymentMethod(paymentMethod);
  const eligibleBanks = canSelectBank
    ? bankOptions.filter((bank) => bank.paymentMethods.includes(paymentMethod))
    : [];
  const selectedBank = eligibleBanks.find((bank) => String(bank.id) === bankAssignmentId);
  const bankHelp = paymentMethod === ""
    ? "Select a method first."
    : paymentMethod === "CASH"
      ? "Unavailable for cash."
      : canSelectBank && eligibleBanks.length === 0
        ? "Enable a bank for this method in Payment Provider."
        : null;
  const hasRecordedBank =
    expense?.bankName != null &&
    paymentMethod === (expense.paymentMethod ?? "") &&
    bankAssignmentId === String(expense.bankAssignmentId ?? "");
  const showUnavailableBank =
    hasRecordedBank &&
    bankAssignmentId !== "" &&
    !selectedBank;
  const bankLabel = showUnavailableBank
    ? `${expense?.bankName} (previously selected)`
    : selectedBank?.name ?? "No bank";

  function resetFields() {
    if (expense) {
      expectedUpdatedAt.current = expense.updatedAt;
      setTitle(expense.title);
      setMerchant(expense.merchant ?? "");
      setAmount(formatPesoInput(expense.amountCentavos));
      setDate(expense.date.slice(0, 10));
      setTime(expenseTimeInput(expense.timeMinutes));
      setCategoryId(String(expense.categoryId));
      setPaymentMethod(expense.paymentMethod ?? "");
      setBankAssignmentId(String(expense.bankAssignmentId ?? ""));
    } else {
      submissionId.current = crypto.randomUUID();
      setTitle("");
      setMerchant("");
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
      !isBankPaymentMethod(method) ||
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
      case "merchant":
        setMerchant(value);
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
      case "paymentMethod":
        if (isPaymentMethod(value)) changePaymentMethod(value);
        break;
      case "bank":
        if (eligibleBanks.some((bank) => String(bank.id) === value)) setBankAssignmentId(value);
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

  return (
    <div>
      <FormDialog
        triggerLabel={expense ? "Edit" : "+ New Expense"}
        triggerAriaLabel={expense ? `Edit expense: ${expense.title}` : undefined}
        triggerFocusKey={focusKey}
        triggerVariant={expense ? "secondary" : "primary"}
        triggerClassName={inMenu ? `${menuStyles.item} w-full cursor-pointer px-3 py-2 text-left text-sm` : undefined}
        returnFocusId={expense ? "expense-history-title" : undefined}
        title={expense ? "Edit Expense" : "New Expense"}
        description={hasRepaymentPlan ? "The amount, date, and payment method are tied to this expense’s repayment plan." : undefined}
        dialogSize={showSchedule ? "extra-wide" : "wide"}
        compact
        pendingMessage="Saving your expense. Please wait..."
        failureMessage="Unable to save your expense. Please try again."
        submitLabel={expense ? "Save changes" : "Save expense"}
        pendingLabel="Saving..."
        disabled={!hasCategories}
        onOpenAction={resetFields}
        submitAction={saveExpenseInGroup}
      >
        <div className={`grid items-start gap-4 ${expense ? "" : "md:grid-cols-2"} ${showSchedule ? "lg:grid-cols-3" : ""}`}>
          <div className={`grid min-w-0 gap-4 ${expense ? "sm:grid-cols-2" : ""}`}>
            <div className="col-span-full min-w-0">
              <label htmlFor={`${fieldId}-title`} className={fieldLabelClass}>Title</label>
              <TextInput
                id={`${fieldId}-title`}
                name="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Lunch"
              />
            </div>

            <div className="col-span-full min-w-0">
              <label htmlFor={`${fieldId}-merchant`} className={fieldLabelClass}>
                Merchant <span className="text-xs">(optional)</span>
              </label>
              <TextInput
                id={`${fieldId}-merchant`}
                name="merchant"
                type="text"
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
                maxLength={100}
                placeholder="e.g. Grab"
              />
            </div>

            <div className="min-w-0">
              <label htmlFor={`${fieldId}-amount`} className={fieldLabelClass}>Amount (PHP)</label>
              <TextInput
                id={`${fieldId}-amount`}
                name="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                readOnly={hasRepaymentPlan}
                maxLength={20}
                placeholder="150.75"
                aria-describedby={`${fieldId}-amount-help`}
              />
              <p id={`${fieldId}-amount-help`} className={`sr-only mt-1 text-xs text-gray-400 ${expense ? "md:not-sr-only" : "md:[@media(min-height:720px)]:not-sr-only"}`}>Up to two decimal places.</p>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${fieldId}-category`} className={fieldLabelClass}>Category</label>
              <Select
                id={`${fieldId}-category`}
                name="categoryId"
                value={categoryId}
                onChange={setCategoryId}
                required
                options={[
                  { value: "", label: "Select a category" },
                  ...categories.map((category) => ({ value: String(category.id), label: category.name })),
                ]}
              />
            </div>

            <div className="min-w-0">
              <label htmlFor={`${fieldId}-date`} className={fieldLabelClass}>Date</label>
              <DateInput
                id={`${fieldId}-date`}
                name="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                readOnly={hasRepaymentPlan}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${fieldId}-time`} className={fieldLabelClass}>
                Time <span className="text-xs">(Manila, optional)</span>
              </label>
              <DateInput
                id={`${fieldId}-time`}
                name="time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>

            <div className="min-w-0">
              <label htmlFor={`${fieldId}-payment-method`} className={fieldLabelClass}>Payment method</label>
              <Select
                id={`${fieldId}-payment-method`}
                name="paymentMethod"
                value={paymentMethod}
                disabled={hasRepaymentPlan}
                onChange={(value) => changePaymentMethod(value as PaymentMethod | "")}
                options={[
                  { value: "", label: "No payment method" },
                  ...Object.entries(paymentMethodLabels)
                    .filter(([value]) => value !== "PAY_LATER" || !expense || expense.paymentMethod === value)
                    .map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
            {!financed && <div className="min-w-0">
              <label htmlFor={`${fieldId}-bank`} className={fieldLabelClass}>
                Bank <span className="text-xs">(optional)</span>
              </label>
              <Select
                id={`${fieldId}-bank`}
                name="bankAssignmentId"
                value={bankAssignmentId}
                onChange={setBankAssignmentId}
                disabled={!canSelectBank}
                aria-describedby={bankHelp ? `${fieldId}-bank-help` : undefined}
                options={[
                  { value: "", label: "No bank" },
                  ...(showUnavailableBank ? [{ value: bankAssignmentId, label: bankLabel, disabled: true }] : []),
                  ...eligibleBanks.map((bank) => ({ value: String(bank.id), label: bank.name })),
                ]}
              />
              {bankHelp && <p id={`${fieldId}-bank-help`} className="mt-1 text-xs text-gray-400">{bankHelp}</p>}
            </div>}
            {hasRecordedBank && (!canSelectBank || bankAssignmentId === "") && (
              <p className="col-span-full wrap-anywhere text-sm text-gray-400">Recorded bank: {expense?.bankName}</p>
            )}
            {!expense && <CreditAccountFields creditAccounts={creditAccounts} hidden={!showSchedule} />}
            {showSchedule && (
              <button
                type="button"
                className="button-secondary min-h-10 justify-self-start rounded-lg px-4 text-sm font-medium lg:hidden"
                onClick={() => receiptHeading.current?.focus()}
              >
                Go to receipt image
              </button>
            )}
          </div>

          {!expense && (
            <div className={`grid min-w-0 gap-4 ${showSchedule ? "lg:contents" : ""}`}>
              <FinancedPurchaseFields purchaseDate={date} hidden={!showSchedule} />
              <ReceiptImageInput headingRef={receiptHeading} paymentMethod={paymentMethod} bankOptions={bankOptions} onApply={applyReceiptSuggestion} />
            </div>
          )}
        </div>
      </FormDialog>

      {!hasCategories && (
        <p className="mt-1 text-xs text-gray-400">Create a category first.</p>
      )}
    </div>
  );
}
