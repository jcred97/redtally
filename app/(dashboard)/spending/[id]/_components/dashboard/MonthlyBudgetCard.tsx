"use client";

import { useId } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { removeMonthlyBudget, saveMonthlyBudget } from "../../_lib/dashboard/mutations";
import { parseExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount, formatPesoInput } from "@/app/lib/expenses/money";

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const editButtonClass = "button-secondary inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium";

export default function MonthlyBudgetCard({
  expenseGroupId,
  month,
  totalCentavos,
  expenseCount,
  budgetCentavos,
}: {
  expenseGroupId: number;
  month: string;
  totalCentavos: number;
  expenseCount: number;
  budgetCentavos: number | null;
}) {
  const id = useId();
  const cardId = `${id}-card`;
  const headingId = `${id}-heading`;
  const hasBudget = budgetCentavos !== null;
  const monthLabel = monthFormatter.format(parseExpenseDate(`${month}-01`));
  const spent = formatPesoAmount(totalCentavos);
  const remaining = hasBudget ? budgetCentavos - totalCentavos : 0;
  const overBudget = remaining < 0;
  const budgetAction = hasBudget ? "Edit budget" : "Set Budget";

  return (
    <section
      id={cardId}
      tabIndex={-1}
      aria-labelledby={hasBudget ? headingId : undefined}
      aria-label={hasBudget ? undefined : "Spending summary"}
      className={`min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6 ${hasBudget ? "" : "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4"}`}
    >
      <header className={hasBudget ? "mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2" : "col-start-2 row-start-1"}>
        {hasBudget && (
          <h2 id={headingId} className="self-center text-base font-semibold text-white sm:text-lg">Monthly budget</h2>
        )}
        <div className="flex flex-wrap gap-2">
          <FormDialog
            triggerLabel={budgetAction}
            triggerClassName={editButtonClass}
            title={`${budgetAction} for ${monthLabel}`}
            submitLabel="Save budget"
            pendingLabel="Saving…"
            failureMessage="Unable to save the budget. Try again."
            onOpenAction={() => {}}
            submitAction={(formData) => saveMonthlyBudget(expenseGroupId, month, formData)}
          >
            <label className={`block ${fieldLabelClass}`}>
              Monthly target (₱)
              <TextInput
                name="amount"
                inputMode="decimal"
                defaultValue={hasBudget ? formatPesoInput(budgetCentavos) : ""}
                placeholder="0.00"
                maxLength={11}
                required
                autoFocus
              />
            </label>
          </FormDialog>
          {hasBudget && (
            <FormDialog
              triggerLabel="Remove"
              triggerAriaLabel="Remove budget"
              triggerClassName="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-sm text-gray-300 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-red-400"
              title={`Remove budget for ${monthLabel}?`}
              description="This removes the monthly target. Your expenses will still appear in history."
              submitLabel="Remove budget"
              pendingLabel="Removing…"
              failureMessage="Unable to remove the budget. Try again."
              onOpenAction={() => {}}
              submitAction={() => removeMonthlyBudget(expenseGroupId, month)}
              returnFocusId={cardId}
              successFocusId={cardId}
              destructive
            >
              {null}
            </FormDialog>
          )}
        </div>
      </header>

      <dl className={hasBudget ? "grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3" : "col-start-1 row-start-1"}>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="text-sm text-gray-400">Total spent</dt>
          <dd className="mt-1 wrap-anywhere text-2xl font-semibold tracking-tight text-white tabular-nums sm:text-3xl">{spent}</dd>
          <dd className="mt-1 text-xs text-gray-400">{expenseCount} {expenseCount === 1 ? "expense" : "expenses"}</dd>
        </div>
        {hasBudget && (
          <>
            <div className="min-w-0">
              <dt className="text-sm text-gray-400">Budget target</dt>
              <dd className="mt-1 wrap-anywhere text-lg font-semibold tabular-nums sm:text-2xl">{formatPesoAmount(budgetCentavos)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-gray-400">{overBudget ? "Over budget" : "Remaining"}</dt>
              <dd className={`mt-1 wrap-anywhere text-lg font-semibold tabular-nums sm:text-2xl ${overBudget ? "text-red-300" : "text-emerald-300"}`}>
                {formatPesoAmount(Math.abs(remaining))}
              </dd>
            </div>
          </>
        )}
      </dl>

      {!hasBudget ? (
        <p className="col-span-2 mt-3 text-sm text-gray-400">No budget set for {monthLabel}.</p>
      ) : (
        <div aria-hidden="true" className="mt-5 h-2 overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full ${overBudget ? "bg-red-400" : "bg-emerald-400"}`}
            style={{ width: `${Math.min(totalCentavos / budgetCentavos, 1) * 100}%` }}
          />
        </div>
      )}
    </section>
  );
}
