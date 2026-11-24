"use client";

import type { BankCatalogEntry } from "@/app/(dashboard)/_lib/banks/access";
import { saveBankAssignment } from "@/app/(dashboard)/_lib/banks/mutations";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Checkbox from "@/app/components/forms/Checkbox";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import SettingsTileLabel, { settingsTileClass } from "@/app/components/tiles/SettingsTileLabel";
import BankLogo from "./BankLogo";

const paymentMethods = [
  { name: "supportedDebitCard", label: "Debit card" },
  { name: "supportedCreditCard", label: "Credit card" },
  { name: "supportedBankTransfer", label: "Bank transfer" },
  { name: "supportedBankPayment", label: "Bank payment" },
] as const;

export default function BankSettingsDialog({
  expenseGroupId,
  bank,
}: {
  expenseGroupId: number;
  bank: BankCatalogEntry;
}) {
  const savedEnabled = bank.assignment?.active ?? false;
  const status = bank.active ? (savedEnabled ? "Enabled" : "Not enabled") : "Unavailable";

  async function save(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    formData.set("bankId", String(bank.id));
    return saveBankAssignment(formData);
  }

  return (
    <FormDialog
      triggerLabel={(
        <SettingsTileLabel icon={<BankLogo name={bank.name} />} name={bank.name} status={status} enabled={bank.active && savedEnabled} />
      )}
      triggerClassName={settingsTileClass}
      title={bank.name}
      description={
        bank.active
          ? "Choose how you use this bank in this expense group."
          : savedEnabled
            ? "This bank is unavailable for new use. Clear all payment methods to disable it for this expense group."
            : "This bank is unavailable for new use."
      }
      submitDisabled={!bank.active && !savedEnabled}
      submitLabel="Save changes"
      pendingLabel="Saving..."
      pendingMessage="Saving bank settings..."
      failureMessage="Unable to save bank settings. Please try again."
      submitAction={save}
    >
      <fieldset>
        <legend className={`mb-1 ${fieldLabelClass}`}>Payment Methods</legend>
        {paymentMethods.map(({ name, label }) => {
          const selected = savedEnabled && bank.assignment?.[name] === true;
          return (
            <label key={name} className={`flex min-h-10 items-center gap-3 has-disabled:opacity-60 ${fieldLabelClass}`}>
              <Checkbox name={name} defaultChecked={selected} disabled={!bank.active && !selected} />
              {label}
            </label>
          );
        })}
      </fieldset>
    </FormDialog>
  );
}
