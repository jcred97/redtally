"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { createCreditAccount, type LoanActionState } from "@/app/lib/loans/mutations";
import TextInput from "@/app/components/forms/TextInput";
import { loanPanel, primaryAction } from "./LoanPage";

export default function CreditAccountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [result, action, pending] = useActionState<LoanActionState, FormData>(async (previous, formData) => {
    const saved = await createCreditAccount(previous, formData);
    if (saved.success && saved.id) router.replace(`/loans/accounts/${saved.id}`);
    return saved;
  }, {});

  return (
    <form action={action} className={`${loanPanel} max-w-xl`}>
      <h2 className="font-semibold">Add Credit Account</h2>
      <label htmlFor="credit-account-name" className="mt-3 mb-1.5 block text-sm font-medium">Account name</label>
      <div className="flex items-start gap-3">
        <TextInput id="credit-account-name" name="name" className="min-w-0" placeholder="e.g. SPayLater" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={pending || result.success} className={`${primaryAction} shrink-0`}>{pending ? "Saving…" : "Add Account"}</button>
      </div>
      {result.error && <p role="alert" className="mt-2 text-sm text-red-300">{result.error}</p>}
    </form>
  );
}
