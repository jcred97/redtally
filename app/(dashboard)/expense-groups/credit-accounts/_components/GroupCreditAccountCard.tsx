"use client";

import Image from "next/image";
import { useState } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Checkbox from "@/app/components/forms/Checkbox";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import SettingsTileLabel, { settingsTileClass } from "@/app/components/tiles/SettingsTileLabel";
import { setGroupCreditAccountSettings } from "@/app/lib/loans/mutations";

export type GroupCreditAccount = {
  id: string;
  enabled: boolean;
  assignment?: { active: boolean; supportsPayLater: boolean } | null;
};

const saveError = "Unable to save credit account settings. Please try again.";

export default function GroupCreditAccountCard({ expenseGroupId, title, initials, method, productKey, account }: {
  expenseGroupId: number;
  title: string;
  initials: string;
  method: string;
} & ({ productKey: string; account?: GroupCreditAccount } | { productKey?: never; account: GroupCreditAccount })) {
  const savedActive = account?.assignment?.active ?? account?.enabled ?? false;
  const savedSupportsPayLater = account?.assignment?.supportsPayLater ?? true;
  const savedEnabled = savedActive && savedSupportsPayLater;
  const [active, setActive] = useState(savedActive);

  async function save(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    if (productKey !== undefined) {
      formData.set("productKey", productKey);
    } else {
      formData.set("creditAccountId", account.id);
    }
    const result = await setGroupCreditAccountSettings({}, formData);
    return result.success ? { success: true } as const : { error: result.error ?? saveError };
  }

  return (
    <FormDialog
      triggerLabel={(
        <SettingsTileLabel name={title} status={savedEnabled ? "Enabled" : "Not enabled"} enabled={savedEnabled} icon={productKey === "spaylater" ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
            <Image src="/branding/shopee.svg" alt="" width={32} height={32} unoptimized />
          </span>
        ) : (
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-700 text-xs font-semibold uppercase text-gray-100">
            {initials}
          </span>
        )} />
      )}
      triggerClassName={settingsTileClass}
      title={title}
      description="Choose how you use this credit account in this expense group."
      onOpenAction={() => setActive(savedActive)}
      submitLabel="Save changes"
      pendingLabel="Saving..."
      pendingMessage="Saving credit account settings..."
      failureMessage={saveError}
      submitAction={save}
    >
      <label className={`flex min-h-10 items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 has-disabled:opacity-60 ${fieldLabelClass}`}>
        <Checkbox name="active" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Enable for this expense group
      </label>

      <fieldset disabled={!active} className="disabled:opacity-60">
        <legend className={`mb-1 ${fieldLabelClass}`}>Credit methods</legend>
        <label className={`flex min-h-10 items-center gap-3 ${fieldLabelClass}`}>
          <Checkbox name="supportsPayLater" defaultChecked={savedSupportsPayLater} />
          {method}
        </label>
      </fieldset>
    </FormDialog>
  );
}
