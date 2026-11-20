"use client";

import { useRouter } from "next/navigation";
import FormDialog from "@/app/components/dialogs/FormDialog";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { createCreditAccount } from "@/app/lib/loans/mutations";
import { primaryAction } from "./LoanPage";

export default function CreditAccountForm() {
  const router = useRouter();

  async function submit(formData: FormData) {
    const saved = await createCreditAccount({}, formData);
    if (!saved.success || !saved.id) {
      return { error: saved.error ?? "Unable to create the credit account." };
    }
    router.replace(`/loans/accounts/${saved.id}`);
    return { success: true } as const;
  }

  return (
    <FormDialog
      triggerLabel="+ New Credit Account"
      triggerClassName={primaryAction}
      title="New Credit Account"
      compact
      onOpenAction={() => {}}
      submitLabel="Create account"
      pendingLabel="Creating…"
      failureMessage="Unable to create the credit account. Please try again."
      submitAction={submit}
    >
      <div>
        <label htmlFor="credit-account-name" className={fieldLabelClass}>Account name</label>
        <TextInput id="credit-account-name" name="name" required maxLength={120} />
      </div>
    </FormDialog>
  );
}
