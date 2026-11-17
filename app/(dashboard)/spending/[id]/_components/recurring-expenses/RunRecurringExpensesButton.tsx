"use client";

import { useActionState } from "react";
import { runDueExpenses } from "@/app/(dashboard)/_lib/recurring-expenses/mutations";

export default function RunRecurringExpensesButton({ expenseGroupId }: { expenseGroupId: number }) {
  const [result, run, pending] = useActionState(runDueExpenses.bind(null, expenseGroupId), null);

  return (
    <form action={run} aria-busy={pending}>
      <button
        type="submit"
        disabled={pending}
        className="button-secondary rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-wait"
      >
        {pending ? "Running…" : "Run due expenses"}
      </button>
      {!pending && result && (
        "error" in result ? (
          <p role="alert" className="mt-1 text-sm text-red-300">{result.error}</p>
        ) : (
          <p role="status" className="mt-1 text-sm text-gray-400">
            {result.generated > 0
              ? `${result.generated} ${result.generated === 1 ? "expense" : "expenses"} posted.`
              : result.needsAttention || result.hasCatchUpRemaining ? "No new expenses posted." : "No expenses due."}
            {result.needsAttention > 0 && ` ${result.needsAttention} ${result.needsAttention === 1 ? "schedule needs" : "schedules need"} attention.`}
            {result.hasCatchUpRemaining && " Due expenses remain. Run again to continue."}
          </p>
        )
      )}
    </form>
  );
}
