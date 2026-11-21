import Link from "next/link";
import type { ExpenseHistoryEntry } from "@/app/(dashboard)/_lib/expense-groups/queries";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { expenseTimeInput, formatExpenseDate, formatExpenseTime } from "@/app/lib/expenses/date";
import { paymentMethodLabels, type ExpenseBankOption } from "@/app/lib/expenses/payment";
import ExpensePaymentProvider, { getExpenseBankName, getExpensePaymentProvider } from "./ExpensePaymentProvider";
import EditExpenseButton from "./EditExpenseButton";
import DeleteExpenseButton from "./DeleteExpenseButton";
import ExpenseActionMenu from "./ExpenseActionMenu";
import GroupedExpenseHistory from "./GroupedExpenseHistory";
import type { CreditProviderOption } from "./ExpenseFormDialog";

type ExpenseHistoryProps = {
  expenseGroupId: number;
  groupPath: string;
  categories: { id: number; name: string }[];
  bankOptions: ExpenseBankOption[];
  creditProviders: CreditProviderOption[];
  expenses: ExpenseHistoryEntry[];
  groupedSummary?: { day?: string; month?: string; through?: string; totalExpenses: number; totalCentavos: bigint };
  page: number;
  totalPages: number;
  filterQuery: string;
};

const pageLinkClass = "rounded-lg border px-3 py-2 text-sm font-medium";

function expenseActionFocusKeys(id: number) {
  return { edit: `expense-edit-${id}`, delete: `expense-delete-${id}` };
}

function expenseDateTime(expense: ExpenseHistoryEntry) {
  const date = expense.date.toISOString().slice(0, 10);
  return expense.timeMinutes === null ? date : `${date}T${expenseTimeInput(expense.timeMinutes)}`;
}

export default function ExpenseHistory({
  expenseGroupId,
  groupPath,
  categories,
  bankOptions,
  creditProviders,
  expenses,
  groupedSummary,
  page,
  totalPages,
  filterQuery,
}: ExpenseHistoryProps) {
  function expensePageHref(page: number) {
    const query = new URLSearchParams(filterQuery);
    if (page > 1) query.set("page", String(page));
    const search = query.size > 0 ? `?${query}` : "";
    return `${groupPath}${search}#expense-history-title`;
  }

  function expenseActions(expense: ExpenseHistoryEntry, inMenu = false) {
    const keys = expenseActionFocusKeys(expense.id);
    return (
      <>
        <EditExpenseButton
          focusKey={keys.edit}
          inMenu={inMenu}
          expenseGroupId={expenseGroupId}
          categories={categories}
          bankOptions={bankOptions}
          creditProviders={creditProviders}
          expense={{
            id: expense.id,
            title: expense.title,
            merchant: expense.merchant,
            amountCentavos: expense.amountCentavos,
            date: expense.date.toISOString(),
            timeMinutes: expense.timeMinutes,
            updatedAt: expense.updatedAt.toISOString(),
            categoryId: expense.categoryId,
            paymentMethod: expense.paymentMethod,
            bankAssignmentId: expense.bankAssignmentId,
            bankName: getExpenseBankName(expense),
            payLaterProviderKey: expense.payLaterProviderKey,
            payLaterProviderName: expense.payLaterProviderName,
          }}
        />
        <DeleteExpenseButton
          focusKey={keys.delete}
          inMenu={inMenu}
          expenseGroupId={expenseGroupId}
          expense={{
            id: expense.id,
            title: expense.title,
            amountCentavos: expense.amountCentavos,
          }}
        />
      </>
    );
  }

  function expenseMenu(expense: ExpenseHistoryEntry) {
    const keys = expenseActionFocusKeys(expense.id);
    return (
      <ExpenseActionMenu title={expense.title} focusKeys={[keys.edit, keys.delete]}>
        {expenseActions(expense, true)}
      </ExpenseActionMenu>
    );
  }

  return (
    <>
      {groupedSummary ? (
        <GroupedExpenseHistory expenses={expenses} {...groupedSummary} renderActions={expenseMenu} />
      ) : (
        <>
          <ul className="space-y-3 sm:hidden">
            {expenses.map((expense) => {
              const paymentLabel = expense.paymentMethod && paymentMethodLabels[expense.paymentMethod];
              const provider = getExpensePaymentProvider(expense);

              return (
                <li key={expense.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="wrap-anywhere font-medium">{expense.title}</h3>
                      {expense.merchant && <p className="mt-0.5 wrap-anywhere text-xs text-gray-400">{expense.merchant}</p>}
                    </div>
                    <p className="whitespace-nowrap font-semibold text-red-400">
                      {formatPesoAmount(expense.amountCentavos)}
                    </p>
                  </div>
                  <p className="mt-2 break-words text-sm text-gray-400">
                    <time dateTime={expenseDateTime(expense)}>
                      {formatExpenseDate(expense.date)}
                      {expense.timeMinutes !== null && `, ${formatExpenseTime(expense.timeMinutes)}`}
                    </time>
                    {" · "}{expense.category.name}
                  </p>
                  {(paymentLabel || provider) && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
                      {paymentLabel && <span>{paymentLabel}</span>}
                      {paymentLabel && provider && <span aria-hidden="true">·</span>}
                      {provider && <ExpensePaymentProvider {...provider} />}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">{expenseActions(expense)}</div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-separate border-spacing-y-1.5 text-sm [&_:is(th,td)]:px-2.5 lg:[&_:is(th,td)]:px-4">
              <caption className="sr-only">Expense history</caption>
              <thead>
                <tr className="text-left text-xs font-medium text-gray-400 [&>th]:border-b [&>th]:border-gray-800">
                  <th scope="col" className="py-4">Date &amp; time</th>
                  <th scope="col" className="py-4">Title</th>
                  <th scope="col" className="py-4">Category</th>
                  <th scope="col" className="py-4">Payment Method</th>
                  <th scope="col" className="py-4">Payment Provider</th>
                  <th scope="col" className="py-4 text-right">Amount</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => {
                  const provider = getExpensePaymentProvider(expense);

                  return (
                    <tr key={expense.id} className="bg-gray-900 transition-colors hover:bg-gray-800/60 focus-within:bg-gray-800/60 [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl">
                      <td className="py-4 text-gray-400">
                        <time dateTime={expenseDateTime(expense)}>
                          {formatExpenseDate(expense.date)}
                          {expense.timeMinutes !== null && (
                            <span className="mt-0.5 block whitespace-nowrap text-xs">{formatExpenseTime(expense.timeMinutes)}</span>
                          )}
                        </time>
                      </td>
                      <td className="py-4 font-medium">
                        {expense.title}
                        {expense.merchant && (
                          <p className="mt-0.5 w-0 min-w-full wrap-anywhere text-xs font-normal text-gray-400">{expense.merchant}</p>
                        )}
                      </td>
                      <td className="py-4 text-gray-300">
                        {expense.category.icon && <span aria-hidden="true">{expense.category.icon} </span>}
                        {expense.category.name}
                      </td>
                      <td className="py-4 text-gray-400">
                        {expense.paymentMethod ? paymentMethodLabels[expense.paymentMethod] : "—"}
                      </td>
                      <td className="py-4 text-gray-400">
                        {provider ? <ExpensePaymentProvider {...provider} /> : "—"}
                      </td>
                      <td className="py-4 text-right font-semibold text-red-400">
                        {formatPesoAmount(expense.amountCentavos)}
                      </td>
                      <td className="py-2 text-right">{expenseMenu(expense)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
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
    </>
  );
}
