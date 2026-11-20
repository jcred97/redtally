"use client";

import { useId, useState } from "react";
import DateInput from "@/app/components/forms/DateInput";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";

export type CreditAccountOption = { id: string; name: string };

const addAccount = "new";

export default function FinancedPurchaseFields({
  creditAccounts,
  purchaseDate,
  hidden,
}: {
  creditAccounts: CreditAccountOption[];
  purchaseDate: string;
  hidden: boolean;
}) {
  const id = useId();
  const [accountId, setAccountId] = useState(creditAccounts[0]?.id ?? addAccount);
  const [installmentCount, setInstallmentCount] = useState("1");

  return (
    <fieldset disabled={hidden} hidden={hidden} className={hidden ? undefined : "col-span-full grid min-w-0 gap-4"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-account`} className={fieldLabelClass}>Credit account</label>
          <Select id={`${id}-account`} value={accountId} onChange={setAccountId}
            options={[
              ...creditAccounts.map((account) => ({ value: account.id, label: account.name })),
              { value: addAccount, label: "Add credit account" },
            ]} />
          {accountId !== addAccount && <input type="hidden" name="creditAccountId" value={accountId} />}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-term`} className={fieldLabelClass}>Term</label>
          <Select id={`${id}-term`} value={installmentCount} onChange={setInstallmentCount}
            options={Array.from({ length: 24 }, (_, index) => ({
              value: String(index + 1),
              label: index === 0 ? "One payment" : `${index + 1} installments`,
            }))} />
        </div>
        {accountId === addAccount && (
          <div className="col-span-full">
            <label htmlFor={`${id}-account-name`} className={fieldLabelClass}>New credit account name</label>
            <TextInput id={`${id}-account-name`} name="creditAccountName" required maxLength={100}
              placeholder="e.g. SPayLater" />
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">Use the dates and amounts shown by your provider.</p>
      {Array.from({ length: Number(installmentCount) }, (_, index) => (
        <div key={index} className="grid gap-4 sm:grid-cols-2">
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
