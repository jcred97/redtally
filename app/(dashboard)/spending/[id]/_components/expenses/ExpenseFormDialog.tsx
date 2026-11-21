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

export type CreditProviderOption = { key: string; name: string };

const paymentMethods = Object.keys(paymentMethodLabels).filter(isPaymentMethod);

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
  payLaterProviderKey: string | null;
  payLaterProviderName: string | null;
};

type ExpenseFormDialogProps = {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  creditProviders?: CreditProviderOption[];
  expense?: EditableExpense;
  focusKey?: string;
  inMenu?: boolean;
};

export default function ExpenseFormDialog({
  expenseGroupId,
  categories,
  bankOptions,
  creditProviders = [],
  expense,
  focusKey,
  inMenu,
}: ExpenseFormDialogProps) {
  const fieldId = useId();
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
  const [creditProviderKey, setCreditProviderKey] = useState("");
  const hasCategories = categories.length > 0;
  const previousProviderKey = expense?.payLaterProviderKey;
  const legacyPayLater = expense?.paymentMethod === "PAY_LATER" && !previousProviderKey;
  const eligibleBanks = isBankPaymentMethod(paymentMethod)
    ? bankOptions.filter((bank) => bank.paymentMethods.includes(paymentMethod))
    : [];
  const providerOptions = creditProviders.map(({ key, name }) => ({ value: `PAY_LATER:${key}`, label: `Pay Later — ${name}` }));
  if (previousProviderKey && !creditProviders.some(({ key }) => key === previousProviderKey)) {
    providerOptions.push({
      value: `PAY_LATER:${previousProviderKey}`,
      label: `Pay Later — ${expense?.payLaterProviderName ?? previousProviderKey} (previously selected)`,
    });
  }
  const paymentDetail = paymentMethod === "PAY_LATER" ? creditProviderKey : bankAssignmentId;
  const paymentValue = paymentDetail ? `${paymentMethod}:${paymentDetail}` : paymentMethod;
  const needsProvider = paymentMethod === "PAY_LATER" && !legacyPayLater && !creditProviderKey;
  const payLaterPlaceholder = legacyPayLater ? "Pay Later — no provider recorded"
    : creditProviders.length ? "Pay Later — choose a provider" : "Pay Later — no providers enabled";
  const paymentOptions = [
    { value: "", label: "No payment method" },
    ...paymentMethods.flatMap((method): { value: string; label: string; disabled?: boolean }[] => {
      const label = paymentMethodLabels[method];
      if (method === "PAY_LATER") {
        return [
          ...(legacyPayLater || needsProvider || !creditProviders.length
            ? [{ value: method, label: payLaterPlaceholder, disabled: !legacyPayLater }]
            : []),
          ...providerOptions,
        ];
      }
      if (!isBankPaymentMethod(method)) return [{ value: method, label }];

      const banks = bankOptions.filter((bank) => bank.paymentMethods.includes(method));
      const previousBankId = expense?.paymentMethod === method ? expense.bankAssignmentId : null;
      const historicalBank = previousBankId !== null && !banks.some(({ id }) => id === previousBankId)
        ? [{ value: `${method}:${previousBankId}`, label: `${label} — ${expense?.bankName ?? "Unavailable bank"} (previously selected)`, disabled: true }]
        : [];
      return [
        { value: method, label },
        ...banks.map(({ id, name }) => ({ value: `${method}:${id}`, label: `${label} — ${name}` })),
        ...historicalBank,
      ];
    }),
  ];
  const showRecordedBank = expense?.bankName != null && expense.bankAssignmentId == null &&
    paymentMethod === (expense.paymentMethod ?? "") && !bankAssignmentId;

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
      setCreditProviderKey(previousProviderKey ?? "");
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
      setCreditProviderKey("");
    }
  }

  function selectPayment(value: string) {
    const separator = value.indexOf(":");
    const method = separator < 0 ? value : value.slice(0, separator);
    const detail = separator < 0 ? "" : value.slice(separator + 1);
    setPaymentMethod(isPaymentMethod(method) ? method : "");
    setBankAssignmentId(isBankPaymentMethod(method) ? detail : "");
    setCreditProviderKey(method === "PAY_LATER" ? detail : "");
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
        if (isPaymentMethod(value) && value !== paymentMethod) {
          const keepBank = isBankPaymentMethod(value) && bankOptions.some(
            ({ id, paymentMethods }) => String(id) === bankAssignmentId && paymentMethods.includes(value),
          );
          selectPayment(keepBank ? `${value}:${bankAssignmentId}` : value);
        }
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
    formData.set("creditProviderKey", creditProviderKey);

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
        dialogSize="wide"
        compact
        pendingMessage="Saving your expense. Please wait..."
        failureMessage="Unable to save your expense. Please try again."
        submitLabel={expense ? "Save changes" : "Save expense"}
        pendingLabel="Saving..."
        disabled={!hasCategories}
        submitDisabled={needsProvider}
        onOpenAction={resetFields}
        submitAction={saveExpenseInGroup}
      >
        <div className={`grid items-start gap-4 ${expense ? "" : "md:grid-cols-2"}`}>
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
                value={paymentValue}
                onChange={selectPayment}
                options={paymentOptions}
              />
              {needsProvider && !creditProviders.length && (
                <p className="mt-1 text-xs text-gray-400">Enable a provider in Payment Provider → Pay Later.</p>
              )}
            </div>
            {showRecordedBank && (
              <p className="col-span-full wrap-anywhere text-sm text-gray-400">Recorded bank: {expense?.bankName}</p>
            )}
          </div>

          {!expense && (
            <ReceiptImageInput paymentMethod={paymentMethod} bankOptions={bankOptions} onApply={applyReceiptSuggestion} />
          )}
        </div>
      </FormDialog>

      {!hasCategories && (
        <p className="mt-1 text-xs text-gray-400">Create a category first.</p>
      )}
    </div>
  );
}
