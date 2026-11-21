"use client";

import CreateNameDialog from "@/app/components/dialogs/CreateNameDialog";
import { setGroupCreditAccountSettings } from "@/app/lib/loans/mutations";

const failureMessage = "Unable to add the credit provider. Please try again.";

export default function AddCreditProviderButton({ expenseGroupId }: { expenseGroupId: number }) {
  async function addProvider(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    formData.set("active", "on");
    formData.set("supportsPayLater", "on");
    const result = await setGroupCreditAccountSettings({}, formData);
    return result.success ? { success: true } as const : { error: result.error ?? failureMessage };
  }

  return (
    <CreateNameDialog
      triggerLabel="Add credit provider"
      title="Add credit provider"
      description="Enable a custom Pay Later provider for this expense group."
      placeholder="e.g. Store installments"
      failureMessage={failureMessage}
      createAction={addProvider}
    />
  );
}
