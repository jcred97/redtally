import { parseExpenseDay, parseExpenseMonth } from "@/app/lib/expenses/date";
import {
  parseExpenseHistoryBankFilter,
  parseExpenseHistoryMerchantFilter,
  parseExpenseHistoryPaymentMethod,
  parseExpenseHistorySearch,
} from "@/app/(dashboard)/_lib/expense-groups/access";

export type ExpenseGroupQuery = Record<string, string | string[] | undefined>;

export function canonicalExpenseGroupHref(publicId: string, query: ExpenseGroupQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }
  return `/spending/${publicId}${params.size > 0 ? `?${params}` : ""}`;
}

export function parseExpenseGroupQuery(query: ExpenseGroupQuery, today: string) {
  const { tab, page: rawPage, month: rawMonth, day: rawDay, through: rawThrough, allMonths, category, paymentMethod: rawMethod, bank: rawBank, merchant: rawMerchant, view } = query;
  const showCategories = tab === "categories";
  const showBanks = tab === "banks";
  const showRecurring = tab === "recurring";
  const showDashboard = tab === "dashboard";
  const showExpenses = !showCategories && !showBanks && !showRecurring && !showDashboard;
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
  const bank = parseExpenseHistoryBankFilter(rawBank);
  const bankFilterValue = bank && typeof rawBank === "string" ? rawBank : undefined;
  const search = parseExpenseHistorySearch(query.search ?? query.merchantSearch);
  const merchant = search ? undefined : parseExpenseHistoryMerchantFilter(rawMerchant);
  const filters = { day, month, through, categoryId, paymentMethod, bank, merchant, search };
  const filterParams = new URLSearchParams();
  if (categoryId !== undefined) filterParams.set("category", String(categoryId));
  if (paymentMethod !== undefined) filterParams.set("paymentMethod", paymentMethod);
  if (bankFilterValue !== undefined) filterParams.set("bank", bankFilterValue);
  if (merchant !== undefined) filterParams.set("merchant", merchant);
  if (search !== undefined) filterParams.set("search", search);
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
    if (through) {
      filterParams.set("through", through);
      monthScopeParams.set("month", month);
    } else {
      monthScopeParams.set("allMonths", "1");
    }
  }
  if (grouped) {
    filterParams.set("view", "grouped");
    monthScopeParams.set("view", "grouped");
  }
  const filterQuery = filterParams.toString();

  return {
    showCategories, showBanks, showRecurring, showDashboard, showExpenses,
    grouped, requestedPage, currentMonth, chosenMonth, dashboardMonth,
    day, month, through, categoryId, paymentMethod, bankFilterValue, merchant, search,
    filters, hasOtherFilters, hasFilters, filterQuery,
    monthScopeQuery: monthScopeParams.toString(),
  };
}

export type ExpenseGroupView = ReturnType<typeof parseExpenseGroupQuery>;

export function expenseGroupLinks(publicId: string, view: ExpenseGroupView) {
  const { grouped, chosenMonth, showDashboard, showRecurring, showBanks, showCategories } = view;
  const groupPath = `/spending/${publicId}`;
  const expenseTab = grouped ? "?view=grouped" : "";
  const expensesHref = showDashboard && chosenMonth
    ? `${groupPath}?month=${chosenMonth}`
    : groupPath + expenseTab;
  const viewSuffix = grouped ? "&view=grouped" : "";
  const categoriesTab = `?tab=categories${viewSuffix}`;
  const banksTab = `?tab=banks${viewSuffix}`;
  const recurringTab = `?tab=recurring${viewSuffix}`;
  const dashboardTab = `?tab=dashboard${chosenMonth ? `&month=${chosenMonth}` : ""}`;
  const tabSuffix = showDashboard ? dashboardTab : showRecurring ? recurringTab : showBanks ? banksTab : showCategories ? categoriesTab : expenseTab;
  const allMonthsParams = new URLSearchParams(view.filterQuery);
  allMonthsParams.delete("day");
  allMonthsParams.delete("month");
  allMonthsParams.delete("through");
  allMonthsParams.set("allMonths", "1");
  return {
    groupPath, expenseTab, expensesHref, categoriesTab, banksTab, recurringTab,
    dashboardTab, tabSuffix,
    monthScopeHref: `${groupPath}?${view.monthScopeQuery}`,
    allMonthsHref: `${groupPath}?${allMonthsParams}`,
    historyViewHref(nextGrouped: boolean, page: number) {
      const query = new URLSearchParams(view.filterQuery);
      if (nextGrouped) query.set("view", "grouped");
      else query.delete("view");
      if (page > 1) query.set("page", String(page));
      return `${groupPath}?${query}`;
    },
  };
}

export type ExpenseGroupLinks = ReturnType<typeof expenseGroupLinks>;
