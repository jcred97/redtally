import { parseExpenseDay, parseExpenseMonth } from "@/app/lib/expenses/date";
import { expenseHistoryQueryKeys, nextExpenseHistoryScope } from "./expenses/scope";
import { expenseGroupTabSuffix, isExpenseGroupTab, type ExpenseGroupTab } from "./tabs";
import {
  parseExpenseHistoryBankFilter,
  parseExpenseHistoryMerchantFilter,
  parseExpenseHistoryPayLaterProviderFilter,
  parseExpenseHistoryPaymentMethod,
  parseExpenseHistorySearch,
} from "@/app/(dashboard)/_lib/expense-groups/access";

export type ExpenseGroupQuery = Record<string, string | string[] | undefined>;

const paymentProvidersTabValue = "payment-providers";
const payLaterProviderTabValue = "pay-later";

export function canonicalExpenseGroupHref(publicId: string, query: ExpenseGroupQuery, tab?: ExpenseGroupTab) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "tab") continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }
  const tabPath = tab && (tab !== "dashboard" || params.size > 0) ? `/${tab}` : "";
  return `/expense-groups/${publicId}${tabPath}${params.size > 0 ? `?${params}` : ""}`;
}

export function recurringExpenseAnchor(id: number) {
  return `recurring-expense-${id}`;
}

export function legacyExpenseGroupHref(publicId: string, query: ExpenseGroupQuery) {
  const { tab } = query;
  if (tab === "banks" || tab === "credit-accounts") {
    return canonicalExpenseGroupHref(publicId, {
      ...query,
      provider: tab === "credit-accounts" ? payLaterProviderTabValue : undefined,
    }, paymentProvidersTabValue);
  }
  return canonicalExpenseGroupHref(publicId, query, isExpenseGroupTab(tab) ? tab : "expenses");
}

export function expenseGroupRedirectHref(routeKey: string, publicId: string, query: ExpenseGroupQuery, tab?: ExpenseGroupTab) {
  if (!tab && query.tab !== undefined) return legacyExpenseGroupHref(publicId, query);
  // Before Dashboard became the default, filters on the bare group URL opened Expenses.
  if (!tab && expenseHistoryQueryKeys.some((key) => query[key] !== undefined)) {
    return canonicalExpenseGroupHref(publicId, query, "expenses");
  }
  if (routeKey !== publicId || query.tab !== undefined || (tab === "dashboard" && Object.keys(query).length === 0)) {
    return canonicalExpenseGroupHref(publicId, query, tab);
  }
  return null;
}

export function parseExpenseGroupQuery(query: ExpenseGroupQuery, today: string, tab: ExpenseGroupTab = "dashboard") {
  const { page: rawPage, month: rawMonth, day: rawDay, through: rawThrough, allMonths, category, paymentMethod: rawMethod, bank: rawBank, merchant: rawMerchant, view } = query;
  const showCategories = tab === "categories";
  const showPaymentProviders = tab === paymentProvidersTabValue;
  const showPayLater = showPaymentProviders && query.provider === payLaterProviderTabValue;
  const showRecurring = tab === "recurring";
  const showBilling = tab === "billing";
  const showDashboard = tab === "dashboard";
  const showExpenses = tab === "expenses";
  const grouped = view === "grouped";
  const requestedPage = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage)
    ? Number(rawPage)
    : 1;
  const currentMonth = today.slice(0, 7);
  const day = parseExpenseDay(rawDay);
  const chosenMonth = parseExpenseMonth(rawMonth);
  const dashboardMonth = chosenMonth ?? currentMonth;
  const month = day?.slice(0, 7) ?? chosenMonth ?? (allMonths === "1" ? undefined : currentMonth);
  const requestedThrough = parseExpenseDay(rawThrough);
  const through = !day && requestedThrough?.slice(0, 7) === month ? requestedThrough : undefined;
  const requestedCategory = typeof category === "string" && /^[1-9]\d{0,9}$/.test(category)
    ? Number(category)
    : undefined;
  const categoryId = requestedCategory !== undefined && requestedCategory <= 2_147_483_647
    ? requestedCategory
    : undefined;
  const paymentMethod = parseExpenseHistoryPaymentMethod(rawMethod);
  const payLaterProvider = parseExpenseHistoryPayLaterProviderFilter(query.paymentProvider);
  const bank = payLaterProvider ? undefined : parseExpenseHistoryBankFilter(rawBank);
  const bankFilterValue = bank && typeof rawBank === "string" ? rawBank : undefined;
  const search = parseExpenseHistorySearch(query.search ?? query.merchantSearch);
  const merchant = search ? undefined : parseExpenseHistoryMerchantFilter(rawMerchant);
  const rawExpense = query.expense;
  const requestedExpense = typeof rawExpense === "string" && /^[1-9]\d{0,9}$/.test(rawExpense)
    ? Number(rawExpense)
    : undefined;
  const expenseId = requestedExpense !== undefined && requestedExpense <= 2_147_483_647
    ? requestedExpense
    : undefined;
  const filters = { ...(expenseId === undefined ? {} : { expenseId }), day, month, through, categoryId, paymentMethod, bank, payLaterProvider, merchant, search };
  const filterParams = new URLSearchParams();
  if (expenseId !== undefined) filterParams.set("expense", String(expenseId));
  if (categoryId !== undefined) filterParams.set("category", String(categoryId));
  if (paymentMethod !== undefined) filterParams.set("paymentMethod", paymentMethod);
  if (bankFilterValue !== undefined) filterParams.set("bank", bankFilterValue);
  if (payLaterProvider !== undefined) filterParams.set("paymentProvider", `pay-later:${payLaterProvider}`);
  if (merchant !== undefined) filterParams.set("merchant", merchant);
  if (search !== undefined) filterParams.set("search", search);
  const hasOtherFilters = filterParams.size > 0;
  const hasFilters = month !== undefined || hasOtherFilters;
  if (day) {
    filterParams.set("day", day);
  } else if (month === undefined) {
    filterParams.set("allMonths", "1");
  } else {
    filterParams.set("month", month);
    if (through) filterParams.set("through", through);
  }
  const monthScopeParams = nextExpenseHistoryScope(filterParams, currentMonth);
  if (grouped) {
    filterParams.set("view", "grouped");
    monthScopeParams.set("view", "grouped");
  }
  const filterQuery = filterParams.toString();

  return {
    showCategories, showPaymentProviders, showPayLater, showRecurring, showBilling, showDashboard, showExpenses,
    grouped, requestedPage, currentMonth, chosenMonth, dashboardMonth,
    day, month, through, categoryId, paymentMethod, bankFilterValue, merchant, search,
    filters, hasOtherFilters, hasFilters, filterQuery,
    monthScopeQuery: monthScopeParams.toString(),
  };
}

export type ExpenseGroupView = ReturnType<typeof parseExpenseGroupQuery>;

export function expenseGroupLinks(publicId: string, view: ExpenseGroupView) {
  const { grouped, chosenMonth, showDashboard, showRecurring, showBilling, showPaymentProviders, showPayLater, showCategories } = view;
  const groupPath = canonicalExpenseGroupHref(publicId, {});
  const expensesPath = canonicalExpenseGroupHref(publicId, {}, "expenses");
  const expenseTab = expenseGroupTabSuffix("expenses", { grouped });
  const expensesHref = showDashboard && chosenMonth
    ? `${expensesPath}?month=${chosenMonth}`
    : groupPath + expenseTab;
  const categoriesTab = expenseGroupTabSuffix("categories", { grouped });
  const paymentProvidersTab = expenseGroupTabSuffix(paymentProvidersTabValue, { grouped });
  const payLaterTab = expenseGroupTabSuffix(paymentProvidersTabValue, { grouped, payLater: true });
  const recurringTab = expenseGroupTabSuffix("recurring", { grouped });
  const billingTab = expenseGroupTabSuffix("billing", { grouped });
  const dashboardTab = expenseGroupTabSuffix("dashboard", { month: chosenMonth });
  const tabSuffix = showDashboard ? dashboardTab
    : showRecurring ? recurringTab
    : showBilling ? billingTab
    : showPayLater ? payLaterTab
    : showPaymentProviders ? paymentProvidersTab
    : showCategories ? categoriesTab
    : expenseTab;
  const allMonthsParams = new URLSearchParams(view.filterQuery);
  allMonthsParams.delete("day");
  allMonthsParams.delete("month");
  allMonthsParams.delete("through");
  allMonthsParams.set("allMonths", "1");
  return {
    groupPath, expensesPath, expenseTab, expensesHref, categoriesTab, paymentProvidersTab, payLaterTab, recurringTab, billingTab,
    dashboardTab, tabSuffix,
    monthScopeHref: `${expensesPath}?${view.monthScopeQuery}`,
    allMonthsHref: `${expensesPath}?${allMonthsParams}`,
    historyViewHref(nextGrouped: boolean, page: number) {
      const query = new URLSearchParams(view.filterQuery);
      if (nextGrouped) query.set("view", "grouped");
      else query.delete("view");
      if (page > 1) query.set("page", String(page));
      return `${expensesPath}?${query}`;
    },
  };
}

export type ExpenseGroupLinks = ReturnType<typeof expenseGroupLinks>;
