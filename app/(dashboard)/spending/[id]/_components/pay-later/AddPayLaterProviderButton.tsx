"use client";

import CreateNameDialog from "@/app/components/dialogs/CreateNameDialog";
import { createGroupPayLaterProvider } from "@/app/lib/pay-later/mutations";

const failureMessage = "Unable to add the credit provider. Please try again.";

export default function AddPayLaterProviderButton({ expenseGroupId }: { expenseGroupId: number }) {
  async function addProvider(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    return createGroupPayLaterProvider(formData);
  }

  return (
    <CreateNameDialog
      triggerLabel="Add credit provider"
      title="Add credit provider"
      description="Add and enable a provider for this expense group."
      placeholder="e.g. Store installments"
      failureMessage={failureMessage}
      createAction={addProvider}
    />
  );
}
