import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  canonicalExpenseGroupHref,
  expenseGroupLinks,
  parseExpenseGroupQuery,
  type ExpenseGroupQuery,
} from "./_lib/navigation";
import DashboardTab from "./_components/dashboard/DashboardTab";
import ExpensesTab from "./_components/expenses/ExpensesTab";
import { getManilaToday } from "@/app/lib/expenses/date";
import { getBankCatalogForExpenseGroup, getExpenseBankOptions } from "@/app/(dashboard)/_lib/banks/queries";
import { getRecurringExpenses } from "@/app/(dashboard)/_lib/recurring-expenses/queries";
import ExpenseGroupBanks from "./_components/banks/ExpenseGroupBanks";
import ExpenseCategories from "./_components/categories/ExpenseCategories";
import ExpenseGroupSettings from "@/app/(dashboard)/_components/expense-groups/ExpenseGroupSettings";
import ExpenseGroupSwitcher from "@/app/(dashboard)/_components/expense-groups/ExpenseGroupSwitcher";
import { getDashboard } from "./_lib/dashboard/queries";
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
  resolveExpenseGroupRoute,
} from "@/app/(dashboard)/_lib/expense-groups/queries";

// The manual recurring-expense action uses a shorter work budget inside this limit.
export const maxDuration = 60;

export default async function ExpenseGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ExpenseGroupQuery>;
}) {
  const [{ id: routeKey }, query] =
    await Promise.all([params, searchParams]);
  const routeGroup = await resolveExpenseGroupRoute(routeKey);
  if (!routeGroup) notFound();
  if (routeKey !== routeGroup.publicId) {
    redirect(canonicalExpenseGroupHref(routeGroup.publicId, query));
  }
  const id = routeGroup.id;
  const today = getManilaToday();
  const view = parseExpenseGroupQuery(query, today);
  const {
    showCategories, showBanks, showRecurring, showDashboard, showExpenses,
    grouped, requestedPage, currentMonth, dashboardMonth, filters, merchant,
  } = view;

  const [expenseGroup, groups, expensePage, bankCatalog, bankOptions, historyBankOptions, historyMerchantOptions, recurringExpenses, dashboard] = await Promise.all([
    getExpenseGroupById(id),
    getExpenseGroupOptions(),
    showExpenses ? getExpensePageByExpenseGroupId(id, requestedPage, filters, grouped) : null,
    showBanks ? getBankCatalogForExpenseGroup(id) : null,
    showExpenses || showRecurring || showDashboard ? getExpenseBankOptions(id) : [],
    showExpenses ? getExpenseHistoryBankOptionsByExpenseGroupId(id) : [],
    showExpenses ? getExpenseHistoryMerchantOptionsByExpenseGroupId(id, "", merchant) : [],
    showRecurring ? getRecurringExpenses(id) : null,
    showDashboard ? getDashboard(id, dashboardMonth, today) : null,
  ]);

  if (!expenseGroup || (showExpenses && !expensePage) || (showBanks && !bankCatalog) || (showDashboard && !dashboard)) {
    notFound();
  }

  const links = expenseGroupLinks(expenseGroup.publicId, view);
  const { groupPath, expensesHref, categoriesTab, banksTab, recurringTab, dashboardTab, tabSuffix } = links;
  const currentGroup = { id: expenseGroup.id, publicId: expenseGroup.publicId, name: expenseGroup.name };
  const categoryOptions = expenseGroup.categories.map(({ id, name }) => ({ id, name }));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 text-white sm:px-6">
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
              { label: "Dashboard", href: groupPath + dashboardTab, current: showDashboard },
              { label: "Expenses", href: expensesHref, current: showExpenses },
              { label: "Recurring", href: groupPath + recurringTab, current: showRecurring },
              { label: "Categories", href: groupPath + categoriesTab, current: showCategories },
              { label: "Banks", href: groupPath + banksTab, current: showBanks },
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
        {dashboard ? (
          <DashboardTab
            dashboard={dashboard}
            groupPath={groupPath}
            expenseGroupId={id}
            currentMonth={currentMonth}
            categories={categoryOptions}
            bankOptions={bankOptions}
          />
        ) : expensePage ? (
          <ExpensesTab
            expenseGroupId={id}
            categories={categoryOptions}
            bankOptions={bankOptions}
            historyBankOptions={historyBankOptions}
            historyMerchantOptions={historyMerchantOptions}
            expensePage={expensePage}
            view={view}
            links={links}
          />
        ) : recurringExpenses ? (
          <RecurringExpenses
            groupPath={groupPath}
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
