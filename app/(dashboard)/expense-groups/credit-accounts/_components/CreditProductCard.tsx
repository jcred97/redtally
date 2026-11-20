"use client";

import Link from "next/link";
import { useState } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Checkbox from "@/app/components/forms/Checkbox";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import SettingsTileLabel, { settingsTileClass } from "@/app/components/tiles/SettingsTileLabel";
import { creditAccountHref } from "@/app/lib/loans/credit-account-links";
import { setCreditProductEnabled } from "@/app/lib/loans/mutations";
import { secondaryAction } from "@/app/(dashboard)/loans/_components/LoanPage";

const saveError = "Unable to save credit account settings. Please try again.";

export default function CreditProductCard({
  product,
  account,
  standalone,
}: {
  product: { key: string; name: string; provider: string };
  account?: { id: string; enabled: boolean };
  standalone: boolean;
}) {
  const title = `${product.provider} · ${product.name}`;
  const savedEnabled = account?.enabled ?? false;
  const [enabled, setEnabled] = useState(savedEnabled);

  async function save(formData: FormData) {
    formData.set("productKey", product.key);
    const result = await setCreditProductEnabled({}, formData);
    if (!result.success) {
      return { error: result.error ?? saveError };
    }
    return { success: true } as const;
  }

  const accountLink = account && (
    <Link href={creditAccountHref(account.id)} aria-label={`View account for ${title}`} className={standalone ? `${secondaryAction} m-2` : secondaryAction}>
      View Account
    </Link>
  );

  const settings = (
    <FormDialog
      triggerLabel={(
        <SettingsTileLabel
          name={title}
          status={savedEnabled ? "Enabled" : "Not enabled"}
          enabled={savedEnabled}
          icon={(
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-700 text-xs font-semibold uppercase text-gray-100">
              {product.provider.slice(0, 2)}
            </span>
          )}
        />
      )}
      triggerClassName={standalone
        ? "flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-3 self-stretch rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        : settingsTileClass}
      title={title}
      description="Make this account available for new Pay Later expenses across your expense groups."
      onOpenAction={() => setEnabled(savedEnabled)}
      submitDisabled={savedEnabled === enabled}
      submitLabel="Save changes"
      pendingLabel="Saving…"
      pendingMessage="Saving credit account settings…"
      failureMessage={saveError}
      submitAction={save}
    >
      <label className={`flex min-h-10 items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 ${fieldLabelClass}`}>
        <Checkbox name="enabled" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Enable {product.name}
      </label>
      {!standalone && accountLink}
    </FormDialog>
  );

  return standalone ? (
    <div className="flex h-full flex-wrap items-center rounded-lg border border-gray-800 bg-gray-900">
      {settings}
      {accountLink}
    </div>
  ) : settings;
}
