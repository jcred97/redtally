"use client";

import CreateNameDialog from "@/app/components/dialogs/CreateNameDialog";
import { createGroupPayLaterProvider } from "@/app/lib/pay-later/mutations";

const failureMessage = "Unable to add the Pay Later provider. Please try again.";

export default function AddPayLaterProviderButton({ expenseGroupId }: { expenseGroupId: number }) {
  async function addProvider(formData: FormData) {
    formData.set("expenseGroupId", String(expenseGroupId));
    return createGroupPayLaterProvider(formData);
  }

  return (
    <CreateNameDialog
      triggerLabel="Add Pay Later provider"
      title="Add Pay Later provider"
      description="Add and enable a provider for this expense group."
      placeholder="e.g. Store installments"
      failureMessage={failureMessage}
      createAction={addProvider}
    />
  );
}
