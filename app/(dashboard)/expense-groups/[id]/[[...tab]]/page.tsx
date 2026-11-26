import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  expenseGroupLinks,
  expenseGroupRedirectHref,
  parseExpenseGroupQuery,
  type ExpenseGroupQuery,
} from "../_lib/navigation";
import { isExpenseGroupTab } from "../_lib/tabs";
import DashboardTab from "../_components/dashboard/DashboardTab";
import BillingTab from "../_components/billing/BillingTab";
import ExpensesTab from "../_components/expenses/ExpensesTab";
import ExpenseGroupPayLater from "../_components/pay-later/ExpenseGroupPayLater";
import { getManilaToday } from "@/app/lib/expenses/date";
import { getExpenseGroupPayLater } from "@/app/lib/pay-later/queries";
import { getBankAssignmentOptions, getBankCatalogForExpenseGroup } from "@/app/(dashboard)/_lib/banks/queries";
import { getRecurringExpenses } from "@/app/(dashboard)/_lib/recurring-expenses/queries";
import ExpenseGroupBanks from "../_components/banks/ExpenseGroupBanks";
import ExpenseCategories from "../_components/categories/ExpenseCategories";
import { getDashboard } from "../_lib/dashboard/queries";
import { getBilling } from "../_lib/billing/queries";
import NewCategoryButton from "../_components/categories/NewCategoryButton";
import NewExpenseButton from "../_components/expenses/NewExpenseButton";
import RecurringExpenseDialog from "../_components/recurring-expenses/RecurringExpenseDialog";
import RecurringExpenses from "../_components/recurring-expenses/RecurringExpenses";
import {
  getExpenseGroupById,
  getExpenseHistoryAvailability,
  getExpenseHistoryProviderOptions,
  getExpenseHistoryMerchantLabel,
  getExpensePageByExpenseGroupId,
  resolveExpenseGroupRoute,
} from "@/app/(dashboard)/_lib/expense-groups/queries";

// The manual recurring-expense action uses a shorter work budget inside this limit.
export const maxDuration = 60;

export default async function ExpenseGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
  searchParams: Promise<ExpenseGroupQuery>;
}) {
  const [{ id: routeKey, tab: segments = [] }, query] = await Promise.all([params, searchParams]);
  const [tab] = segments;
  if (segments.length > 1 || (tab !== undefined && !isExpenseGroupTab(tab))) notFound();
  const routeGroup = await resolveExpenseGroupRoute(routeKey);
  if (!routeGroup) notFound();
  const redirectHref = expenseGroupRedirectHref(routeKey, routeGroup.publicId, query, tab);
  if (redirectHref) redirect(redirectHref);
  const id = routeGroup.id;
  const today = getManilaToday();
  const view = parseExpenseGroupQuery(query, today, tab);
  const {
    showCategories, showPaymentProviders, showPayLater, showRecurring, showBilling, showDashboard, showExpenses,
    grouped, requestedPage, currentMonth, dashboardMonth, filters, merchant,
  } = view;
  const showBanks = showPaymentProviders && !showPayLater;

  const [expenseGroup, expensePage, bankCatalog, bankOptions, historyProviderOptions, merchantLabel, recurringExpenses, dashboard, payLater, billing] = await Promise.all([
    getExpenseGroupById(id),
    showExpenses ? getExpensePageByExpenseGroupId(id, requestedPage, filters, grouped) : null,
    showBanks ? getBankCatalogForExpenseGroup(id) : null,
    showExpenses || showRecurring || showDashboard ? getBankAssignmentOptions(id) : [],
    showExpenses ? getExpenseHistoryProviderOptions(id) : [],
    showExpenses && merchant && merchant !== "none" ? getExpenseHistoryMerchantLabel(id, merchant) : null,
    showRecurring ? getRecurringExpenses(id) : null,
    showDashboard ? getDashboard(id, dashboardMonth, today) : null,
    showExpenses || showDashboard ? getExpenseGroupPayLater(id) : null,
    showBilling ? getBilling(id) : null,
  ]);

  if (!expenseGroup || (showExpenses && !expensePage) || (showBanks && !bankCatalog) || (showDashboard && !dashboard) || (showBilling && !billing)) {
    notFound();
  }
  const historyAvailability = expensePage?.totalExpenses === 0
    ? await getExpenseHistoryAvailability(id, filters)
    : undefined;
  if (historyAvailability === null) notFound();

  const links = expenseGroupLinks(expenseGroup.publicId, view);
  const { groupPath, expensesHref, categoriesTab, paymentProvidersTab, payLaterTab, recurringTab, billingTab, dashboardTab } = links;
  const categoryOptions = expenseGroup.categories.map(({ id, name }) => ({ id, name }));
  const payLaterProviders = payLater?.providers.filter(({ active, productEnabled }) => active && productEnabled) ?? [];
  const activeTabId = "expense-group-active-tab";

  let primaryAction = null;
  if (showCategories || ((showExpenses || showDashboard) && categoryOptions.length === 0)) {
    primaryAction = <NewCategoryButton expenseGroupId={id} successFocusId={showCategories ? undefined : activeTabId} />;
  } else if (showExpenses || showDashboard) {
    primaryAction = <NewExpenseButton expenseGroupId={id} categories={categoryOptions} bankOptions={bankOptions} payLaterProviders={payLaterProviders} />;
  } else if (showRecurring && categoryOptions.length > 0) {
    primaryAction = <RecurringExpenseDialog expenseGroupId={id} categories={categoryOptions} banks={bankOptions} today={today} />;
  }

  return (
    <>
      <div>
        <div className="mt-4 sm:mt-6 lg:grid lg:grid-cols-[1fr_auto] lg:gap-6 lg:border-b lg:border-gray-800">
          <nav aria-label="Expense group views" className="flex flex-wrap border-b border-gray-800 lg:min-h-14 lg:border-b-0">
            {[
              { label: "Dashboard", href: groupPath + dashboardTab, current: showDashboard },
              { label: "Expenses", href: expensesHref, current: showExpenses },
              { label: "Recurring", href: groupPath + recurringTab, current: showRecurring },
              { label: "Billing", href: groupPath + billingTab, current: showBilling },
              { label: "Categories", href: groupPath + categoriesTab, current: showCategories },
              { label: "Payment Provider", href: groupPath + paymentProvidersTab, current: showPaymentProviders },
            ].map(({ label, href, current }) => (
              <Link
                key={label}
                href={href}
                prefetch={!current}
                transitionTypes={["expense-group-tab"]}
                id={current ? activeTabId : undefined}
                aria-current={current ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-400 sm:px-4 ${current ? "border-red-500 text-white" : "border-transparent text-gray-400 hover:text-white"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {primaryAction && (
            <div key={id} className="mt-3 flex justify-end lg:my-2 lg:self-center [&_button]:min-h-10 [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-red-400">
              {primaryAction}
            </div>
          )}
        </div>
      </div>

      <main className="py-6 sm:py-8">
        {dashboard ? (
          <DashboardTab
            dashboard={dashboard}
            groupPath={groupPath}
            expenseGroupId={id}
            currentMonth={currentMonth}
          />
        ) : expensePage ? (
          <ExpensesTab
            expenseGroupId={id}
            categories={categoryOptions}
            bankOptions={bankOptions}
            payLaterProviders={payLaterProviders}
            historyProviderOptions={historyProviderOptions}
            merchantLabel={merchant === "none" ? "No merchant" : merchant ? merchantLabel ?? "Unavailable merchant" : undefined}
            expensePage={expensePage}
            historyAvailability={historyAvailability}
            view={view}
            links={links}
          />
        ) : recurringExpenses ? (
          <RecurringExpenses
            categoriesHref={groupPath + categoriesTab}
            key={expenseGroup.id}
            expenseGroupId={expenseGroup.id}
            today={today}
            categories={categoryOptions}
            banks={bankOptions}
            rules={recurringExpenses}
          />
        ) : billing ? (
          <BillingTab cycles={billing} expensesHref={expensesHref} />
        ) : showPaymentProviders ? (
          <div key={expenseGroup.id} className="space-y-6">
            <nav aria-label="Payment Provider views" className="inline-flex gap-0.5 rounded-lg border border-gray-800 p-0.5">
              {[
                { label: "Banks", href: groupPath + paymentProvidersTab, current: showBanks },
                { label: "Pay Later", href: groupPath + payLaterTab, current: showPayLater },
              ].map(({ label, href, current }) => (
                <Link
                  key={label}
                  href={href}
                  prefetch={!current}
                  transitionTypes={["expense-group-tab"]}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-red-400 ${current ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-white"}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {bankCatalog
              ? <ExpenseGroupBanks expenseGroupId={expenseGroup.id} banks={bankCatalog} />
              : <ExpenseGroupPayLater expenseGroupId={expenseGroup.id} />}
          </div>
        ) : (
          <ExpenseCategories expenseGroupId={expenseGroup.id} categories={expenseGroup.categories} />
        )}
      </main>
    </>
  );
}
