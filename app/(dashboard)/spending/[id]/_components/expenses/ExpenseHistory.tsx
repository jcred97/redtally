import Link from "next/link";
import type { ReactNode } from "react";
import type { getExpensePageByExpenseGroupId } from "@/app/(dashboard)/_lib/expense-groups/queries";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { expenseTimeInput, formatExpenseDate, formatExpenseTime, parseExpenseDate } from "@/app/lib/expenses/date";
import { paymentMethodLabels, type ExpenseBankOption } from "@/app/lib/expenses/payment";
import BankLogo from "../banks/BankLogo";
import EditExpenseButton from "./EditExpenseButton";
import DeleteExpenseButton from "./DeleteExpenseButton";
import ExpenseActionMenu from "./ExpenseActionMenu";

type ExpenseHistoryProps = {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  expenses: NonNullable<Awaited<ReturnType<typeof getExpensePageByExpenseGroupId>>>["expenses"];
  month?: string;
  totalExpenses: number;
  totalCentavos: bigint;
  emptyState: ReactNode;
  page: number;
  totalPages: number;
  filterQuery: string;
};

const pageLinkClass = "rounded-lg border px-3 py-2 text-sm font-medium";

function expenseBankName(expense: ExpenseHistoryProps["expenses"][number]) {
  return expense.bankAssignment?.bank.name ?? expense.legacyBankName;
}

function expenseCountLabel(count: number) {
  return `${count} ${count === 1 ? "expense" : "expenses"}`;
}

function historyPeriod(month: string | undefined) {
  if (!month) return "All months";
  const firstDay = parseExpenseDate(`${month}-01`);
  const lastDay = new Date(firstDay);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  return `${formatExpenseDate(firstDay)} – ${formatExpenseDate(lastDay)}`;
}

export default function ExpenseHistory({
  expenseGroupId,
  categories,
  bankOptions,
  expenses,
  month,
  totalExpenses,
  totalCentavos,
  emptyState,
  page,
  totalPages,
  filterQuery,
}: ExpenseHistoryProps) {
  const expensesByDay = new Map<string, ExpenseHistoryProps["expenses"]>();
  for (const expense of expenses) {
    const day = expense.date.toISOString().slice(0, 10);
    const dayExpenses = expensesByDay.get(day);
    if (dayExpenses) dayExpenses.push(expense);
    else expensesByDay.set(day, [expense]);
  }

  function expensePageHref(page: number) {
    const query = new URLSearchParams(filterQuery);
    if (page > 1) query.set("page", String(page));
    const search = query.size > 0 ? `?${query}` : "";
    return `/spending/${expenseGroupId}${search}#expense-history-title`;
  }

  function expenseActions(expense: ExpenseHistoryProps["expenses"][number]) {
    const menuFocusKey = `expense-actions-${expense.id}`;
    return (
      <ExpenseActionMenu title={expense.title} focusKey={menuFocusKey}>
        <EditExpenseButton
          menuFocusKey={menuFocusKey}
          expenseGroupId={expenseGroupId}
          categories={categories}
          bankOptions={bankOptions}
          expense={{
            id: expense.id,
            title: expense.title,
            amountCentavos: expense.amountCentavos,
            date: expense.date.toISOString(),
            timeMinutes: expense.timeMinutes,
            updatedAt: expense.updatedAt.toISOString(),
            categoryId: expense.categoryId,
            paymentMethod: expense.paymentMethod,
            bankAssignmentId: expense.bankAssignmentId,
            bankName: expenseBankName(expense),
          }}
        />
        <DeleteExpenseButton
          menuFocusKey={menuFocusKey}
          expenseGroupId={expenseGroupId}
          expense={{
            id: expense.id,
            title: expense.title,
            amountCentavos: expense.amountCentavos,
          }}
        />
      </ExpenseActionMenu>
    );
  }

  return (
    <section aria-labelledby="expense-history-title">
      <div className="rounded-xl border border-gray-800 bg-gray-900">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs text-gray-400">{historyPeriod(month)}</p>
            <h2 id="expense-history-title" tabIndex={-1} className="mt-1 text-lg font-semibold">
              {expenseCountLabel(totalExpenses)}
            </h2>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">Total spent</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatPesoAmount(totalCentavos)}</p>
          </div>
        </header>
        {totalExpenses === 0 ? emptyState : Array.from(expensesByDay, ([day, dayExpenses]) => {
          const dateLabel = formatExpenseDate(day);
          const [{ dayExpenseCount, dayTotalCentavos }] = dayExpenses;

          return (
            <section key={day} aria-labelledby={`expense-day-${day}`}>
              <header className="flex items-center justify-between gap-3 border-y border-gray-800 bg-gray-800/55 px-4 py-3 sm:px-6">
                <div>
                  <h3 id={`expense-day-${day}`} className="text-sm font-medium">
                    <time dateTime={day}>{dateLabel}</time>
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">{expenseCountLabel(dayExpenseCount)}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-red-400">
                  <span className="sr-only">Daily total </span>{formatPesoAmount(dayTotalCentavos)}
                </p>
              </header>
              <ul className="divide-y divide-gray-800">
                {dayExpenses.map((expense) => {
                  const bankName = expenseBankName(expense)?.trim();
                  const time = expense.timeMinutes;

                  return (
                    <li
                      key={expense.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 px-3 py-3 transition-colors hover:bg-gray-800/40 focus-within:bg-gray-800/40 sm:grid-cols-[minmax(0,1fr)_8rem_7.5rem_auto] sm:gap-x-4 sm:px-6"
                    >
                      <div className="min-w-0">
                        <h4 className="wrap-anywhere text-sm font-medium sm:text-base">{expense.title}</h4>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                          <span className="wrap-anywhere">
                            {expense.category.icon && <span aria-hidden="true">{expense.category.icon} </span>}
                            {expense.category.name}
                          </span>
                          {bankName && (
                            <>
                              <span aria-hidden="true">/</span>
                              <span className="flex min-w-0 items-center gap-1.5">
                                <BankLogo name={bankName} compact />
                                <span className="wrap-anywhere">{bankName}</span>
                              </span>
                            </>
                          )}
                          {expense.paymentMethod && (
                            <>
                              <span aria-hidden="true">/</span>
                              <span>{paymentMethodLabels[expense.paymentMethod]}</span>
                            </>
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
                      <div className="col-start-3 row-start-1 sm:col-start-4">{expenseActions(expense)}</div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {totalPages > 1 && (
        <nav aria-label="Expense history pages" className="mt-4 flex items-center justify-end gap-3">
          {page > 1 ? (
            <Link
              href={expensePageHref(page - 1)}
              prefetch={false}
              className={`${pageLinkClass} border-gray-700 text-gray-200 hover:bg-gray-800`}
            >
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={`${pageLinkClass} border-gray-800 text-gray-500`}>
              Previous
            </span>
          )}
          <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
          {page < totalPages ? (
            <Link
              href={expensePageHref(page + 1)}
              prefetch={false}
              className={`${pageLinkClass} border-gray-700 text-gray-200 hover:bg-gray-800`}
            >
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className={`${pageLinkClass} border-gray-800 text-gray-500`}>
              Next
            </span>
          )}
        </nav>
      )}
    </section>
  );
}
