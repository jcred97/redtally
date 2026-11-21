"use client";

import Image from "next/image";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Checkbox from "@/app/components/forms/Checkbox";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import SettingsTileLabel, { settingsTileClass } from "@/app/components/tiles/SettingsTileLabel";
import { setGroupPayLaterProvider } from "@/app/lib/pay-later/mutations";

const saveError = "Unable to save credit provider settings. Please try again.";

export default function GroupCreditProviderCard({ expenseGroupId, provider }: {
  expenseGroupId: number;
  provider: { key: string; name: string; active: boolean };
}) {
  async function save(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    formData.set("providerKey", provider.key);
    return setGroupPayLaterProvider(formData);
  }

  return (
    <FormDialog
      triggerLabel={(
        <SettingsTileLabel name={provider.name} status={provider.active ? "Enabled" : "Not enabled"} enabled={provider.active} icon={provider.key === "shopee" ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
            <Image src="/branding/shopee.svg" alt="" width={32} height={32} unoptimized />
          </span>
        ) : (
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-700 text-xs font-semibold uppercase text-gray-100">
            {Array.from(provider.name)[0]}
          </span>
        )} />
      )}
      triggerClassName={settingsTileClass}
      title={provider.name}
      description="Enable this provider to record Pay Later purchases in this expense group."
      onOpenAction={() => {}}
      submitLabel="Save changes"
      pendingLabel="Saving..."
      failureMessage={saveError}
      submitAction={save}
    >
      <label className={`flex min-h-10 items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 ${fieldLabelClass}`}>
        <Checkbox name="active" defaultChecked={provider.active} />
        Enable for this expense group
      </label>
    </FormDialog>
  );
}
