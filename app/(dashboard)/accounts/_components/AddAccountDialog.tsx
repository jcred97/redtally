"use client";

import { useId, useState } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { createFinancialAccount } from "../_lib/mutations";
import { financialAccountTypeLabels, manualFinancialAccountTypes, supportsFinancialAccountBank } from "../_lib/types";

const accountTypeOptions = [...manualFinancialAccountTypes, { value: "PAY_LATER", label: financialAccountTypeLabels.PAY_LATER }];

export default function AddAccountDialog({ banks }: { banks: { id: number; name: string }[] }) {
  const fieldId = useId();
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState("SAVINGS");

  return (
    <FormDialog
      triggerLabel="Add Account"
      triggerClassName="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors enabled:hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50"
      title="Add Account"
      submitLabel="Save account"
      pendingLabel="Saving…"
      failureMessage="Unable to save your account. Please try again."
      onOpenAction={() => {
        setAccountId(crypto.randomUUID());
        setType("SAVINGS");
      }}
      submitAction={createFinancialAccount}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <div>
        <label htmlFor={`${fieldId}-name`} className={fieldLabelClass}>Account name</label>
        <TextInput id={`${fieldId}-name`} name="name" maxLength={120} required />
      </div>
      <div>
        <label htmlFor={`${fieldId}-type`} className={fieldLabelClass}>Account type</label>
        <Select
          id={`${fieldId}-type`}
          name="type"
          value={type}
          onChange={setType}
          options={accountTypeOptions}
          required
        />
      </div>
      {type === "PAY_LATER" ? (
        <p className="text-sm text-gray-400">Pay Later accounts use PHP. After saving, enable the provider under Payment Provider → Pay Later in the expense groups where you use it.</p>
      ) : (
        <div>
          <label htmlFor={`${fieldId}-currency`} className={fieldLabelClass}>Currency</label>
          <TextInput
            id={`${fieldId}-currency`}
            name="currency"
            defaultValue="PHP"
            maxLength={3}
            pattern="[A-Za-z]{3}"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
        </div>
      )}
      {supportsFinancialAccountBank(type) && (
        <div>
          <label htmlFor={`${fieldId}-bank`} className={fieldLabelClass}>Bank (optional)</label>
          <Select
            id={`${fieldId}-bank`}
            name="bankId"
            options={[{ value: "", label: "No bank" }, ...banks.map(({ id, name }) => ({ value: String(id), label: name }))]}
          />
        </div>
      )}
    </FormDialog>
  );
}
