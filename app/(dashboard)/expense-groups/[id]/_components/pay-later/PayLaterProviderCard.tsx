"use client";

import Image from "next/image";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Checkbox from "@/app/components/forms/Checkbox";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import SettingsTileLabel, { settingsTileClass } from "@/app/components/tiles/SettingsTileLabel";
import { setGroupPayLaterProvider } from "@/app/lib/pay-later/mutations";
import type { PayLaterProviderSetting } from "@/app/lib/pay-later/providers";

const saveError = "Unable to save Pay Later provider settings. Please try again.";

export default function PayLaterProviderCard({ expenseGroupId, provider }: {
  expenseGroupId: number;
  provider: PayLaterProviderSetting;
}) {
  const isShopee = provider.providerKey === "shopee";
  const title = isShopee ? "Shopee" : provider.providerName;
  const enabled = provider.active && provider.productEnabled;

  async function save(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    formData.set("providerKey", provider.providerKey);
    return setGroupPayLaterProvider(formData);
  }

  return (
    <FormDialog
      triggerLabel={(
        <SettingsTileLabel name={title} status={enabled ? "Enabled" : "Not enabled"} enabled={enabled} icon={isShopee ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white">
            <Image src="/branding/shopee.svg" alt="" width={32} height={32} unoptimized />
          </span>
        ) : (
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-700 text-xs font-semibold uppercase text-gray-100">
            {Array.from(provider.providerName)[0]}
          </span>
        )} />
      )}
      triggerClassName={settingsTileClass}
      title={title}
      submitLabel="Save changes"
      pendingLabel="Saving..."
      failureMessage={saveError}
      submitAction={save}
    >
      <fieldset>
        <legend className={`mb-1 ${fieldLabelClass}`}>Pay Later products</legend>
        <label className={`flex min-h-10 items-center gap-3 ${fieldLabelClass}`}>
          <Checkbox name="productEnabled" defaultChecked={enabled} />
          {provider.providerName}
        </label>
      </fieldset>
    </FormDialog>
  );
}
