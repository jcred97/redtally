import Link from "next/link";
import { notFound } from "next/navigation";
import { getManilaToday, parseExpenseDay, parseExpenseMonth } from "@/app/lib/expenses/date";
import { formatPesoAmount } from "@/app/lib/expenses/money";
import { getBankCatalogForExpenseGroup, getExpenseBankOptions } from "@/app/(dashboard)/_lib/banks/queries";
import { getRecurringExpenses } from "@/app/(dashboard)/_lib/recurring-expenses/queries";
import {
  parseExpenseHistoryBankFilter,
  parseExpenseHistoryMerchantFilter,
  parseExpenseHistoryPaymentMethod,
} from "@/app/(dashboard)/_lib/expense-groups/access";
import ExpenseGroupBanks from "./_components/banks/ExpenseGroupBanks";
import ExpenseCategories from "./_components/categories/ExpenseCategories";
import ExpenseGroupSettings from "@/app/(dashboard)/_components/expense-groups/ExpenseGroupSettings";
import ExpenseGroupSwitcher from "@/app/(dashboard)/_components/expense-groups/ExpenseGroupSwitcher";
import ExpenseHistory from "./_components/expenses/ExpenseHistory";
import ExpenseHistoryFilters from "./_components/expenses/ExpenseHistoryFilters";
import ImportExpensesButton from "./_components/expenses/ImportExpensesButton";
import NewCategoryButton from "./_components/categories/NewCategoryButton";
import NewExpenseButton from "./_components/expenses/NewExpenseButton";
import RecurringExpenses from "./_components/recurring-expenses/RecurringExpenses";
import {
  getExpenseGroupById,
  getExpenseGroupOptions,
  getExpenseHistoryBankOptionsByExpenseGroupId,
  getExpenseHistoryMerchantOptionsByExpenseGroupId,
  getExpensePageByExpenseGroupId,
} from "@/app/(dashboard)/_lib/expense-groups/queries";

// The manual recurring-expense action uses a shorter work budget inside this limit.
export const maxDuration = 60;

export default async function ExpenseGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    page?: string | string[];
    month?: string | string[];
    day?: string | string[];
    allMonths?: string | string[];
    category?: string | string[];
    paymentMethod?: string | string[];
    bank?: string | string[];
    merchant?: string | string[];
    view?: string | string[];
  }>;
}) {
  const [{ id: rawId }, { tab, page: rawPage, month: rawMonth, day: rawDay, allMonths, category, paymentMethod: rawMethod, bank: rawBank, merchant: rawMerchant, view }] =
    await Promise.all([params, searchParams]);
  const id = Number(rawId);
  const showCategories = tab === "categories";
  const showBanks = tab === "banks";
  const showRecurring = tab === "recurring";
  const showExpenses = !showCategories && !showBanks && !showRecurring;
  const grouped = view === "grouped";
  const requestedPage = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage)
    ? Number(rawPage)
    : 1;
  const today = getManilaToday();
  const currentMonth = today.slice(0, 7);
  const day = parseExpenseDay(rawDay);
  const month = day?.slice(0, 7) ?? parseExpenseMonth(rawMonth) ?? (allMonths === "1" ? undefined : currentMonth);
  const requestedCategory = typeof category === "string" && /^[1-9]\d{0,9}$/.test(category)
    ? Number(category)
    : undefined;
  const categoryId = requestedCategory !== undefined && requestedCategory <= 2_147_483_647
    ? requestedCategory
    : undefined;
  const paymentMethod = parseExpenseHistoryPaymentMethod(rawMethod);
  const bank = parseExpenseHistoryBankFilter(rawBank);
  const bankFilterValue = bank && typeof rawBank === "string" ? rawBank : undefined;
  const merchant = parseExpenseHistoryMerchantFilter(rawMerchant);
  const filters = { day, month, categoryId, paymentMethod, bank, merchant };
  const filterParams = new URLSearchParams();
  if (categoryId !== undefined) filterParams.set("category", String(categoryId));
  if (paymentMethod !== undefined) filterParams.set("paymentMethod", paymentMethod);
  if (bankFilterValue !== undefined) filterParams.set("bank", bankFilterValue);
  if (merchant !== undefined) filterParams.set("merchant", merchant);
  const hasOtherFilters = filterParams.size > 0;
  const hasFilters = month !== undefined || hasOtherFilters;
  const monthScopeParams = new URLSearchParams(filterParams);
  if (day) {
    filterParams.set("day", day);
    monthScopeParams.set("month", day.slice(0, 7));
  } else if (month === undefined) {
    filterParams.set("allMonths", "1");
    monthScopeParams.set("month", currentMonth);
  } else {
    filterParams.set("month", month);
    monthScopeParams.set("allMonths", "1");
  }
  if (grouped) {
    filterParams.set("view", "grouped");
    monthScopeParams.set("view", "grouped");
  }
  const filterQuery = filterParams.toString();

  const [expenseGroup, groups, expensePage, bankCatalog, bankOptions, historyBankOptions, historyMerchantOptions, recurringExpenses] = await Promise.all([
    getExpenseGroupById(id),
    getExpenseGroupOptions(),
    showExpenses ? getExpensePageByExpenseGroupId(id, requestedPage, filters, grouped) : null,
    showBanks ? getBankCatalogForExpenseGroup(id) : null,
    showExpenses || showRecurring ? getExpenseBankOptions(id) : [],
    showExpenses ? getExpenseHistoryBankOptionsByExpenseGroupId(id) : [],
    showExpenses ? getExpenseHistoryMerchantOptionsByExpenseGroupId(id) : [],
    showRecurring ? getRecurringExpenses(id) : null,
  ]);

  if (!expenseGroup || (showExpenses && !expensePage) || (showBanks && !bankCatalog)) {
    notFound();
  }

  const groupPath = `/spending/${expenseGroup.id}`;
  const expenseTab = grouped ? "?view=grouped" : "";
  const viewSuffix = grouped ? "&view=grouped" : "";
  const categoriesTab = `?tab=categories${viewSuffix}`;
  const banksTab = `?tab=banks${viewSuffix}`;
  const recurringTab = `?tab=recurring${viewSuffix}`;
  const tabSuffix = showRecurring ? recurringTab : showBanks ? banksTab : showCategories ? categoriesTab : expenseTab;
  const currentGroup = { id: expenseGroup.id, name: expenseGroup.name };
  const categoryOptions = expenseGroup.categories.map(({ id, name }) => ({ id, name }));

  function historyViewHref(nextGrouped: boolean) {
    const query = new URLSearchParams(filterParams);
    if (nextGrouped) query.set("view", "grouped");
    else query.delete("view");
    if (expensePage && expensePage.page > 1) query.set("page", String(expensePage.page));
    return `${groupPath}?${query}`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 text-white">
      <header className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <ExpenseGroupSwitcher
            key={`switcher-${expenseGroup.id}`}
            currentGroup={currentGroup}
            groups={groups}
            tabSuffix={tabSuffix}
          />
          <ExpenseGroupSettings key={`settings-${expenseGroup.id}`} group={currentGroup} tabSuffix={tabSuffix} />
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-1 border-b border-gray-800 sm:mt-6 sm:gap-4">
          <nav aria-label="Expense group views" className="flex flex-wrap">
            {[
              { label: "Expenses", href: groupPath + expenseTab, current: showExpenses },
              { label: "Categories", href: groupPath + categoriesTab, current: showCategories },
              { label: "Banks", href: groupPath + banksTab, current: showBanks },
              { label: "Recurring", href: groupPath + recurringTab, current: showRecurring },
            ].map(({ label, href, current }) => (
              <Link
                key={label}
                href={href}
                aria-current={current ? "page" : undefined}
                className={`-mb-px border-b-2 px-2.5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-400 sm:px-4 ${current ? "border-red-500 text-white" : "border-transparent text-gray-400 hover:text-white"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {(showExpenses || showCategories) && (
            <div className="ml-auto min-w-0 pb-2 [&_button]:ml-auto [&_button]:whitespace-nowrap [&_p]:text-right max-sm:[&_button]:px-2.5 max-sm:[&_button]:text-xs">
              {showCategories ? (
                <NewCategoryButton expenseGroupId={expenseGroup.id} />
              ) : (
                <div className="flex flex-wrap items-start justify-end gap-2 [&_button]:ml-0">
                  <ImportExpensesButton key={expenseGroup.id} expenseGroupId={expenseGroup.id} categories={categoryOptions} />
                  <NewExpenseButton expenseGroupId={expenseGroup.id} categories={categoryOptions} bankOptions={bankOptions} />
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="py-6 sm:py-8">
        {expensePage ? (
          <>
            <ExpenseHistoryFilters
              key={`${expenseGroup.id}:${filterQuery}:${expensePage.page}`}
              groupPath={groupPath}
              categories={categoryOptions}
              banks={historyBankOptions}
              merchants={historyMerchantOptions}
              month={month}
              day={day}
              categoryId={categoryId}
              paymentMethod={paymentMethod}
              bank={bankFilterValue}
              merchant={merchant}
              grouped={grouped}
              monthScopeHref={`${groupPath}?${monthScopeParams}`}
              clearFiltersHref={groupPath + expenseTab}
              canClearFilters={day !== undefined || month !== currentMonth || hasOtherFilters}
            />
            <section aria-labelledby="expense-history-title">
              <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 id="expense-history-title" tabIndex={-1} className="text-lg font-semibold">Expenses</h2>
                <nav aria-label="Expense history view" className="inline-flex gap-0.5 rounded-lg border border-gray-800 p-0.5">
                  {[
                    { label: "Table", grouped: false },
                    { label: "Grouped by day", grouped: true },
                  ].map((option) => {
                    const current = grouped === option.grouped;
                    return (
                      <Link
                        key={option.label}
                        href={historyViewHref(option.grouped)}
                        prefetch={false}
                        scroll={false}
                        aria-current={current ? "page" : undefined}
                        className={`inline-flex min-h-9 items-center rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-red-400 ${current ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-white"}`}
                      >
                        {option.label}
                      </Link>
                    );
                  })}
                </nav>
              </header>
              {!grouped && (
                <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                    <p className="mb-1 text-sm text-gray-400">Total Spent</p>
                    <p className="text-2xl font-bold">
                      {formatPesoAmount(expensePage.totalCentavos)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                    <p className="mb-1 text-sm text-gray-400">Expenses</p>
                    <p className="text-2xl font-bold">{expensePage.totalExpenses}</p>
                  </div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                    <p className="mb-1 text-sm text-gray-400">Group categories</p>
                    <p className="text-2xl font-bold">{expenseGroup.categories.length}</p>
                  </div>
                </div>
              )}

              {expensePage.totalExpenses === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center">
                  <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-gray-800 bg-gray-900">
                    <span className="text-2xl">💸</span>
                  </div>
                  <p className="font-medium text-gray-300">
                    {hasFilters ? "No expenses match these filters" : "No expenses yet"}
                  </p>
                  {!hasFilters && (
                    <p className="mt-1 text-sm text-gray-500">
                      {categoryOptions.length === 0
                        ? "Add a category in the Categories tab to start recording expenses."
                        : "Click + New Expense to add your first expense."}
                    </p>
                  )}
                </div>
              ) : (
                <ExpenseHistory
                  expenseGroupId={expenseGroup.id}
                  categories={categoryOptions}
                  bankOptions={bankOptions}
                  expenses={expensePage.expenses}
                  groupedSummary={grouped ? { day, month, totalExpenses: expensePage.totalExpenses, totalCentavos: expensePage.totalCentavos } : undefined}
                  page={expensePage.page}
                  totalPages={expensePage.totalPages}
                  filterQuery={filterQuery}
                />
              )}
            </section>
          </>
        ) : recurringExpenses ? (
          <RecurringExpenses
            key={expenseGroup.id}
            expenseGroupId={expenseGroup.id}
            today={today}
            categories={categoryOptions}
            banks={bankOptions}
            rules={recurringExpenses}
          />
        ) : bankCatalog ? (
          <ExpenseGroupBanks key={expenseGroup.id} expenseGroupId={expenseGroup.id} banks={bankCatalog} />
        ) : (
          <ExpenseCategories expenseGroupId={expenseGroup.id} categories={expenseGroup.categories} />
        )}
      </main>
    </div>
  );
}
