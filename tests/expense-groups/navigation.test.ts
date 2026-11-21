import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalExpenseGroupHref,
  expenseGroupLinks,
  expenseGroupRedirectHref,
  parseExpenseGroupQuery,
} from "../../app/(dashboard)/spending/[id]/_lib/navigation";

const today = "2026-11-18";

test("group query defaults and repeated or invalid filters are handled consistently", () => {
  const defaults = parseExpenseGroupQuery({}, today);
  assert.equal(defaults.showExpenses, true);
  assert.equal(defaults.month, "2026-11");
  assert.equal(defaults.requestedPage, 1);
  assert.equal(defaults.filterQuery, "month=2026-11");

  const invalid = parseExpenseGroupQuery({
    tab: ["dashboard", "categories"], page: "0", month: "2026-13",
    day: ["2026-11-01", "2026-11-02"], category: "2147483648",
    paymentMethod: "invalid", bank: "assignment:0", paymentProvider: "pay-later:custom:shop", merchant: "some store",
  }, today);
  assert.deepEqual(invalid, defaults);
  for (const search of [["Cafe", "Shop"], " ", "Cafe\0", "x".repeat(101)]) {
    assert.deepEqual(parseExpenseGroupQuery({ search }, today), defaults);
  }
});

test("Pay Later provider filters carry through month, grouped view, and pagination links", () => {
  const digest = "a".repeat(64);
  const paymentProvider = `pay-later:${digest}`;
  const view = parseExpenseGroupQuery({ allMonths: "1", paymentProvider, bank: "assignment:7" }, today);
  assert.equal(view.filters.payLaterProvider, digest);
  assert.equal(view.filters.bank, undefined);
  const links = expenseGroupLinks("id", view);
  for (const href of [links.monthScopeHref, links.historyViewHref(true, 2)]) {
    const { searchParams } = new URL(href, "https://example.test");
    assert.equal(searchParams.get("paymentProvider"), paymentProvider);
    assert.equal(searchParams.has("bank"), false);
  }
});

test("expense search takes precedence over exact links and follows history navigation", () => {
  const view = parseExpenseGroupQuery({ search: "  100%_Shop ", merchant: "none" }, today);
  assert.equal(view.filters.search, "100%_Shop");
  assert.equal(view.filters.merchant, undefined);
  const links = expenseGroupLinks("id", view);
  for (const href of [links.monthScopeHref, links.historyViewHref(true, 2)]) {
    const { searchParams } = new URL(href, "https://example.test");
    assert.equal(searchParams.get("search"), "100%_Shop");
    assert.equal(searchParams.has("merchant"), false);
  }
  const savedSearch = parseExpenseGroupQuery({ merchantSearch: "  100%_Shop ", merchant: "none" }, today);
  assert.deepEqual(savedSearch, view);
});

test("day filters take precedence and through only applies within the chosen month", () => {
  const day = parseExpenseGroupQuery({ day: "2026-10-03", month: "2026-09", through: "2026-10-05" }, today);
  assert.equal(day.month, "2026-10");
  assert.equal(day.through, undefined);
  assert.equal(day.filterQuery, "day=2026-10-03");
  assert.equal(day.monthScopeQuery, "month=2026-10");

  const through = parseExpenseGroupQuery({ month: "2026-10", through: "2026-10-15" }, today);
  assert.equal(through.filterQuery, "month=2026-10&through=2026-10-15");
  assert.equal(through.monthScopeQuery, "month=2026-10");
  assert.equal(parseExpenseGroupQuery({ month: "2026-10", through: "2026-09-30" }, today).through, undefined);
});

test("month scope toggles retain other filters and grouped view", () => {
  const query = { allMonths: "1", category: "12", paymentMethod: "CASH", bank: "assignment:7", merchant: "none", view: "grouped" };
  const view = parseExpenseGroupQuery(query, today);
  assert.equal(view.month, undefined);
  assert.equal(view.hasFilters, true);
  assert.deepEqual(view.filters.bank, { assignmentId: 7 });
  const scoped = new URLSearchParams(view.monthScopeQuery);
  assert.equal(scoped.get("month"), "2026-11");
  for (const key of ["category", "paymentMethod", "bank", "merchant", "view"] as const) {
    assert.equal(scoped.get(key), query[key]);
  }
  assert.equal(parseExpenseGroupQuery({ month: "2026-10" }, today).monthScopeQuery, "allMonths=1");
  assert.equal(parseExpenseGroupQuery({ allMonths: "1" }, today).hasFilters, false);

  const expectedAllMonths = "/spending/id?category=12&paymentMethod=CASH&bank=assignment%3A7&merchant=none&view=grouped&allMonths=1";
  for (const dateFilter of [{ day: "2026-10-03" }, { month: "2026-10", through: "2026-10-15" }]) {
    const scopedView = parseExpenseGroupQuery({ ...query, ...dateFilter, page: "2" }, today);
    assert.equal(expenseGroupLinks("id", scopedView).allMonthsHref, expectedAllMonths);
  }
});

test("tab and view links preserve the existing month and pagination behavior", () => {
  const view = parseExpenseGroupQuery({ tab: "dashboard", month: "2026-10", view: "grouped", category: "2" }, today);
  const links = expenseGroupLinks("public-id", view);
  assert.equal(links.expensesHref, "/spending/public-id?month=2026-10");
  assert.equal(links.tabSuffix, "?tab=dashboard&month=2026-10");
  assert.equal(links.categoriesTab, "?tab=categories&view=grouped");
  assert.equal(links.historyViewHref(false, 3), "/spending/public-id?category=2&month=2026-10&page=3");
  assert.equal(links.historyViewHref(true, 1), "/spending/public-id?category=2&month=2026-10&view=grouped");
  assert.equal(expenseGroupLinks("id", parseExpenseGroupQuery({ tab: "recurring", view: "grouped" }, today)).tabSuffix, "?tab=recurring&view=grouped");
});

test("canonical group URLs preserve repeated and unknown query parameters", () => {
  assert.equal(canonicalExpenseGroupHref("id", {}), "/spending/id");
  assert.equal(canonicalExpenseGroupHref("id", { tab: "dashboard", extra: ["one two", "three&four"], absent: undefined }),
    "/spending/id?tab=dashboard&extra=one+two&extra=three%26four");
});

test("the Payment Provider tab preserves the group and the grouped-history preference", () => {
  const view = parseExpenseGroupQuery({ tab: "payment-providers", view: "grouped" }, today);
  const links = expenseGroupLinks("public-id", view);

  assert.equal(view.showPaymentProviders, true);
  assert.equal(view.showPayLater, false);
  assert.equal(view.showExpenses, false);
  assert.equal(links.groupPath + links.paymentProvidersTab, "/spending/public-id?tab=payment-providers&view=grouped");
  assert.equal(links.tabSuffix, links.paymentProvidersTab);
  assert.equal(links.expensesHref, "/spending/public-id?view=grouped");

  const payLater = parseExpenseGroupQuery({ tab: "payment-providers", provider: "pay-later", view: "grouped" }, today);
  assert.equal(payLater.showPayLater, true);
  assert.equal(links.groupPath + links.payLaterTab, "/spending/public-id?tab=payment-providers&view=grouped&provider=pay-later");
  assert.equal(expenseGroupLinks("public-id", payLater).tabSuffix, links.payLaterTab);

  for (const provider of ["invalid", ["pay-later", "banks"]]) {
    assert.equal(parseExpenseGroupQuery({ tab: "payment-providers", provider }, today).showPayLater, false);
  }
  assert.equal(parseExpenseGroupQuery({ provider: "pay-later" }, today).showPayLater, false);
});

test("old provider tabs redirect to their provider view without dropping other query parameters", () => {
  assert.equal(expenseGroupRedirectHref("public-id", "public-id", { tab: "payment-providers" }), null);
  assert.equal(expenseGroupRedirectHref("public-id", "public-id", { tab: "banks", view: "grouped", provider: "pay-later" }),
    "/spending/public-id?tab=payment-providers&view=grouped");
  assert.equal(expenseGroupRedirectHref("42", "public-id", { tab: "credit-accounts", view: "grouped" }),
    "/spending/public-id?tab=payment-providers&view=grouped&provider=pay-later");
});
