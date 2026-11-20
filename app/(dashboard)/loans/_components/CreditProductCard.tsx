"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import Checkbox from "@/app/components/forms/Checkbox";
import { setCreditProductEnabled } from "@/app/lib/loans/mutations";
import { loanPanel, primaryAction, secondaryAction } from "./LoanPage";

export default function CreditProductCard({
  product,
  account,
}: {
  product: { key: string; name: string; provider: string };
  account?: { id: string; enabled: boolean };
}) {
  const headingId = useId();
  const helpId = useId();
  const savedEnabled = account?.enabled ?? false;
  const [enabled, setEnabled] = useState(savedEnabled);
  const [result, action, pending] = useActionState(setCreditProductEnabled, {});
  const changed = savedEnabled !== enabled;

  return (
    <section aria-labelledby={headingId} className={loanPanel}>
      <h2 id={headingId} className="font-semibold">{product.provider}</h2>
      <form action={action} className="mt-3 space-y-4">
        <input type="hidden" name="productKey" value={product.key} />
        <div>
          <label className="flex min-h-10 items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium has-disabled:opacity-60">
            <Checkbox name="enabled" checked={enabled} disabled={pending} aria-describedby={helpId}
              onChange={(event) => setEnabled(event.target.checked)} />
            {product.name}
          </label>
          <p id={helpId} className="mt-2 text-sm text-gray-400">Make this account available for new Pay Later expenses across your expense groups.</p>
        </div>
        {result.error && changed && <p role="alert" className="text-sm text-red-300">{result.error}</p>}
        {result.success && !changed && <p role="status" className="sr-only">Credit account settings saved.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !changed} className={primaryAction}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          {account && <Link href={`/loans/accounts/${account.id}`} className={secondaryAction}>View Account</Link>}
        </div>
      </form>
    </section>
  );
}
