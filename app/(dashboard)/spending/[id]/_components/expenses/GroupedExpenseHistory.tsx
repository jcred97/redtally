import type { ReactNode } from "react";
import type { ExpenseHistoryEntry } from "@/app/(dashboard)/_lib/expense-groups/queries";
import { expenseTimeInput, formatExpenseDate, formatExpenseTime, parseExpenseDate } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";
import BankLogo from "../banks/BankLogo";

function expenseCount(count: number) {
  return `${count} ${count === 1 ? "expense" : "expenses"}`;
}

function formatPeriod(month: string | undefined, day: string | undefined, through: string | undefined) {
  if (day) return formatExpenseDate(day);
  if (!month) return "All months";
  const first = parseExpenseDate(`${month}-01`);
  if (through) return `${formatExpenseDate(first)} – ${formatExpenseDate(through)}`;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return `${formatExpenseDate(first)} – ${formatExpenseDate(last)}`;
}

export default function GroupedExpenseHistory({
  expenses,
  day: selectedDay,
  month,
  through,
  totalExpenses,
  totalCentavos,
  renderActions,
}: {
  expenses: ExpenseHistoryEntry[];
  day?: string;
  month?: string;
  through?: string;
  totalExpenses: number;
  totalCentavos: bigint;
  renderActions: (expense: ExpenseHistoryEntry) => ReactNode;
}) {
  const byDay = new Map<string, ExpenseHistoryEntry[]>();
  for (const expense of expenses) {
    const day = expense.date.toISOString().slice(0, 10);
    const entries = byDay.get(day);
    if (entries) entries.push(expense);
    else byDay.set(day, [expense]);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs text-gray-400">{formatPeriod(month, selectedDay, through)}</p>
          <p className="mt-1 text-lg font-semibold">{expenseCount(totalExpenses)}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-400">Total spent</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatPesoAmount(totalCentavos)}</p>
        </div>
      </header>
      {Array.from(byDay, ([day, entries]) => {
        const dateLabel = formatExpenseDate(day);
        const { daySummary } = entries[0];

        return (
          <section key={day} aria-labelledby={`expense-day-${day}`}>
            <header className="flex items-center justify-between gap-3 border-y border-gray-800 bg-gray-800/55 px-4 py-3 sm:px-6">
              <div>
                <h3 id={`expense-day-${day}`} className="text-sm font-medium">
                  <time dateTime={day}>{dateLabel}</time>
                </h3>
                {daySummary && <p className="mt-1 text-xs text-gray-400">{expenseCount(daySummary.count)}</p>}
              </div>
              {daySummary && (
                <p className="text-sm font-semibold tabular-nums text-red-400">
                  <span className="sr-only">Daily total </span>{formatPesoAmount(daySummary.totalCentavos)}
                </p>
              )}
            </header>
            <ul className="divide-y divide-gray-800">
              {entries.map((expense) => {
                const bankName = (expense.bankAssignment?.bank.name ?? expense.legacyBankName)?.trim();
                const time = expense.timeMinutes;

                return (
                  <li
                    key={expense.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 px-3 py-3 transition-colors hover:bg-gray-800/40 focus-within:bg-gray-800/40 sm:grid-cols-[minmax(0,1fr)_8rem_7.5rem_auto] sm:gap-x-4 sm:px-6"
                  >
                    <div className="min-w-0">
                      <h4 className="wrap-anywhere text-sm font-medium sm:text-base">{expense.title}</h4>
                      {expense.merchant && <p className="mt-0.5 wrap-anywhere text-xs text-gray-400">{expense.merchant}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                        <span className="wrap-anywhere">
                          {expense.category.icon && <span aria-hidden="true">{expense.category.icon} </span>}
                          {expense.category.name}
                        </span>
                        {bankName && (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span aria-hidden="true">/</span>
                            <BankLogo name={bankName} compact />
                            <span className="wrap-anywhere">{bankName}</span>
                          </span>
                        )}
                        {expense.paymentMethod && (
                          <span className="inline-flex gap-1.5">
                            <span aria-hidden="true">/</span>
                            <span>{paymentMethodLabels[expense.paymentMethod]}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-start-1 row-start-2 text-xs text-gray-400 sm:col-start-2 sm:row-start-1 sm:text-right">
                      {time === null ? (
                        <time dateTime={day} className="hidden sm:inline">{dateLabel}</time>
                      ) : (
                        <time dateTime={`${day}T${expenseTimeInput(time)}`}>
                          <span className="mt-1 inline-block text-gray-300 sm:mt-0">{formatExpenseTime(time)}</span>
                          <span className="mt-1 hidden sm:block">{dateLabel}</span>
                        </time>
                      )}
                    </div>
                    <p className="col-start-2 row-start-1 text-right text-sm font-semibold tabular-nums sm:col-start-3">
                      {formatPesoAmount(expense.amountCentavos)}
                    </p>
                    <div className="col-start-3 row-start-1 sm:col-start-4">{renderActions(expense)}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
