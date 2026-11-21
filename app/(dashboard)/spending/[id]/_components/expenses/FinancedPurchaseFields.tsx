"use client";

import { useId, useState } from "react";
import DateInput from "@/app/components/forms/DateInput";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";

export type CreditAccountOption = { id: string; name: string; providerKey: string };

export default function FinancedPurchaseFields({
  purchaseDate,
  provider,
  accounts,
  accountId,
  onAccountChange,
  hidden,
}: {
  purchaseDate: string;
  provider?: string;
  accounts: CreditAccountOption[];
  accountId: string;
  onAccountChange: (accountId: string) => void;
  hidden: boolean;
}) {
  const id = useId();
  const [installmentCount, setInstallmentCount] = useState("1");
  const hasAccounts = accounts.length > 0;

  return (
    <fieldset disabled={hidden} hidden={hidden} className={hidden ? undefined : "grid min-w-0 gap-4"}>
      {provider && (
        <div className="min-w-0">
          <label htmlFor={`${id}-account`} className={fieldLabelClass}>Account</label>
          <Select
            id={`${id}-account`}
            name="creditAccountId"
            value={accountId}
            onChange={onAccountChange}
            options={[
              { value: "", label: hasAccounts ? "Select a Pay Later account" : "No Pay Later accounts available", disabled: true },
              ...accounts.map(({ id, name }) => ({ value: id, label: name })),
            ]}
            disabled={!hasAccounts}
            required
            aria-describedby={!hasAccounts ? `${id}-account-help` : undefined}
          />
          {!hasAccounts && (
            <p id={`${id}-account-help`} className="mt-1 text-xs text-gray-400">
              Add a Pay Later account for {provider} in <strong>Accounts → Add Account</strong>.
            </p>
          )}
        </div>
      )}
      <div className="min-w-0">
        <label htmlFor={`${id}-term`} className={fieldLabelClass}>Term</label>
        <Select id={`${id}-term`} value={installmentCount} onChange={setInstallmentCount}
          options={Array.from({ length: 24 }, (_, index) => ({
            value: String(index + 1),
            label: index === 0 ? "One payment" : `${index + 1} installments`,
          }))} />
      </div>
      <p className="text-xs text-gray-400">Use the dates and amounts shown by your provider.</p>
      {Array.from({ length: Number(installmentCount) }, (_, index) => (
        <div key={index} className="grid items-end gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${id}-due-${index}`} className={fieldLabelClass}>Payment {index + 1} due date</label>
            <DateInput id={`${id}-due-${index}`} name="installmentDate" min={purchaseDate} required />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-amount-${index}`} className={fieldLabelClass}>Payment {index + 1} amount (PHP)</label>
            <TextInput id={`${id}-amount-${index}`} name="installmentAmount" inputMode="decimal"
              placeholder="e.g. 1200.00" required maxLength={20} />
          </div>
        </div>
      ))}
    </fieldset>
  );
}
