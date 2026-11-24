"use client";

import Image from "next/image";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Checkbox from "@/app/components/forms/Checkbox";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import SettingsTileLabel, { settingsTileClass } from "@/app/components/tiles/SettingsTileLabel";
import { setGroupPayLaterProvider } from "@/app/lib/pay-later/mutations";
import { getPayLaterProviderDisplayName, type PayLaterProviderSetting } from "@/app/lib/pay-later/providers";

const saveError = "Unable to save Pay Later provider settings. Please try again.";
const providerLogos = new Map([
  ["atome", "/pay-later/atome.png"],
  ["billease", "/pay-later/billease.png"],
  ["gcash", "/banks/gcash.png"],
  ["home-credit", "/pay-later/home-credit.png"],
  ["lazada", "/pay-later/lazada.png"],
  ["shopee", "/branding/shopee.svg"],
]);

export default function PayLaterProviderCard({ expenseGroupId, provider }: {
  expenseGroupId: number;
  provider: PayLaterProviderSetting;
}) {
  const title = getPayLaterProviderDisplayName(provider);
  const logo = providerLogos.get(provider.providerKey);
  const logoFillsBadge = provider.providerKey === "atome";
  const logoSize = logoFillsBadge ? 44 : 32;
  const enabled = provider.active && provider.productEnabled;

  async function save(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    formData.set("providerKey", provider.providerKey);
    return setGroupPayLaterProvider(formData);
  }

  return (
    <FormDialog
      triggerLabel={(
        <SettingsTileLabel
          name={title}
          status={enabled ? "Enabled" : "Not enabled"}
          enabled={enabled}
          icon={(
            <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-full ${
              logo ? "bg-white" : "bg-gray-700 text-xs font-semibold uppercase text-gray-100"
            }`}>
              {logo ? (
                <Image
                  src={logo}
                  alt=""
                  width={logoSize}
                  height={logoSize}
                  unoptimized
                  className={`object-contain ${logoFillsBadge ? "size-11 rounded-full" : "size-8"}`}
                />
              ) : Array.from(title)[0]}
            </span>
          )}
        />
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
