"use client";

import FormDialog from "@/app/components/dialogs/FormDialog";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import type { RecurringExpenseEntry } from "@/app/(dashboard)/_lib/recurring-expenses/access";
import { changeRecurringExpense } from "@/app/(dashboard)/_lib/recurring-expenses/mutations";

export default function RecurringExpenseActions({ rule, today }: { rule: RecurringExpenseEntry; today: string }) {
  const completed = rule.endDate !== null && rule.nextDueDate > rule.endDate;
  const pause = rule.status === "ACTIVE";
  const canBackfill = !pause && rule.nextDueDate.toISOString().slice(0, 10) < today;
  const label = pause ? "Pause" : "Resume";

  return (
    <>
      {!completed && (
        <FormDialog
          triggerLabel={label}
          triggerAriaLabel={`${label} recurring expense: ${rule.title}`}
          triggerVariant="secondary"
          title={`${label} recurring expense?`}
          description={pause
            ? "Pause automatic posting for this schedule."
            : "Resume automatic posting. By default, dates before today are skipped."}
          onOpenAction={() => {}}
          submitLabel={label}
          pendingLabel={pause ? "Pausing..." : "Resuming..."}
          pendingMessage="Updating schedule..."
          failureMessage="Unable to update the schedule. Please try again."
          submitAction={(data) => changeRecurringExpense(rule.expenseGroupId, rule.id, pause ? "pause" : "resume", data)}
        >
          <p className="wrap-anywhere font-medium">{rule.title}</p>
          {canBackfill && (
            <label className="flex items-start gap-2.5 text-sm text-gray-300">
              <input name="backfill" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-red-500" />
              Include missed dates starting {formatExpenseDate(rule.nextDueDate)}
            </label>
          )}
        </FormDialog>
      )}
      <FormDialog
        triggerLabel="Delete"
        triggerAriaLabel={`Delete recurring expense: ${rule.title}`}
        triggerVariant="danger"
        destructive
        returnFocusId="recurring-expenses-title"
        title="Delete recurring expense?"
        description="This removes the schedule. Any expenses it already posted stay in your history."
        onOpenAction={() => {}}
        submitLabel="Delete schedule"
        pendingLabel="Deleting..."
        pendingMessage="Deleting schedule..."
        failureMessage="Unable to delete the schedule. Please try again."
        submitAction={(data) => changeRecurringExpense(rule.expenseGroupId, rule.id, "delete", data)}
      >
        <p className="wrap-anywhere font-medium">{rule.title}</p>
      </FormDialog>
    </>
  );
}
