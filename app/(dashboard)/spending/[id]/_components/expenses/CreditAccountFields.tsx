"use client";

import { useId, useState } from "react";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";

export type CreditAccountOption = { id: string; name: string };

const addAccount = "new";

export default function CreditAccountFields({ creditAccounts, hidden }: {
  creditAccounts: CreditAccountOption[];
  hidden: boolean;
}) {
  const id = useId();
  const [accountId, setAccountId] = useState(creditAccounts[0]?.id ?? addAccount);

  return (
    <fieldset disabled={hidden} hidden={hidden} className={hidden ? undefined : "grid min-w-0 gap-4"}>
      <div className="min-w-0">
        <label htmlFor={`${id}-account`} className={fieldLabelClass}>Credit account</label>
        <Select id={`${id}-account`} value={accountId} onChange={setAccountId}
          options={[
            ...creditAccounts.map((account) => ({ value: account.id, label: account.name })),
            { value: addAccount, label: "Add credit account" },
          ]} />
        {accountId !== addAccount && <input type="hidden" name="creditAccountId" value={accountId} />}
      </div>
      {accountId === addAccount && (
        <div className="min-w-0">
          <label htmlFor={`${id}-account-name`} className={fieldLabelClass}>New credit account name</label>
          <TextInput id={`${id}-account-name`} name="creditAccountName" required maxLength={100}
            placeholder="e.g. SPayLater" />
        </div>
      )}
    </fieldset>
  );
}
