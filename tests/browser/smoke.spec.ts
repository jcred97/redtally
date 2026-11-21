import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readSheet } from "read-excel-file/node";
import { Pool } from "pg";
import { test as base, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import { getManilaToday, parseExpenseDate } from "../../app/lib/expenses/date";
import { browserData } from "./data";

const data = browserData();
const db = new Pool({ connectionString: process.env.REDTALLY_BROWSER_DATABASE_URL, ssl: false, max: 1 });
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const test = base.extend<object, { ownerState: StorageState }>({
  ownerState: [async ({ playwright }, provide) => {
    const baseURL = process.env.REDTALLY_BROWSER_ORIGIN!;
    const api = await playwright.request.newContext({ baseURL });
    try {
      const response = await api.post("/api/auth/sign-in/email", {
        headers: { origin: baseURL! }, data: { email: data.email, password: data.password },
      });
      expect(response.ok()).toBe(true);
      await provide(await api.storageState());
    } finally { await api.dispose(); }
  }, { scope: "worker" }],
  storageState: async ({ ownerState }, provide) => provide(ownerState),
});

test.afterAll(async () => { await db.end(); });

async function expenseCount(title: string, groupId?: number) {
  const result = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM "Expense" WHERE title = $1 AND ($2::int IS NULL OR "expenseGroupId" = $2)',
    [title, groupId ?? null],
  );
  return result.rows[0].count;
}

function groupPath(publicId = data.group.publicId) {
  return `/spending/${publicId}?allMonths=1`;
}

async function newExpense(page: Page) {
  await page.getByRole("button", { name: "+ New Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addPayLaterAccount(page: Page, name: string, provider: string, customProviderName?: string) {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add Account", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add Account", exact: true });
  await dialog.getByLabel("Account name", { exact: true }).fill(name);
  await dialog.getByRole("combobox", { name: "Account type", exact: true }).click();
  await dialog.getByRole("option", { name: "Pay Later", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Credit provider", exact: true }).click();
  await dialog.getByRole("option", { name: provider, exact: true }).click();
  if (customProviderName) {
    await dialog.getByLabel("Custom provider name", { exact: true }).fill(customProviderName);
  }
  await dialog.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function exportExpenses(page: Page, format = "CSV (.csv)") {
  await page.getByRole("button", { name: "Export Expenses", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Expenses", exact: true });
  await dialog.getByRole("radio", { name: format, exact: false }).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"), dialog.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  await expect(dialog).not.toBeVisible();
  expect(await download.failure()).toBeNull();
  return download;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function isAction(route: Route, text: string) {
  const request = route.request();
  return request.method() === "POST" && Boolean(request.headers()["next-action"])
    && Boolean(request.postData()?.includes(text));
}

test("sign-up, sign-in, private routes, and revoked browser sessions", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto(groupPath());
    await expect(page).toHaveURL(/\/sign-in/);
    const anonymousExport = await context.request.get(`/spending/${data.group.publicId}/export?allMonths=1`);
    expect(anonymousExport.status()).toBe(401);
    await page.goto("/sign-up");
    await page.getByLabel("Name", { exact: true }).fill("New Browser Account");
    await page.getByLabel("Email", { exact: true }).fill("new-browser-account@example.test");
    await page.getByLabel("Password", { exact: true }).fill(data.password);
    await page.getByLabel("Confirm password", { exact: true }).fill(data.password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByText("No expense groups yet", { exact: true })).toBeVisible();
    await page.goto(groupPath());
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    await expect(page.getByText("Browser daily expenses", { exact: true })).toHaveCount(0);
    await page.goto("/");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.getByLabel("Email", { exact: true }).fill(data.email);
    await page.getByLabel("Password", { exact: true }).fill(data.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Expense Groups", exact: true }).click();
    await expect(page.getByRole("link", { name: /Browser daily expenses/ })).toBeVisible();
    await page.goto(groupPath(data.foreign.publicId));
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    await expect(page.getByText("Foreign secret", { exact: true })).toHaveCount(0);
    expect((await context.request.get(`/spending/${data.foreign.publicId}/export?allMonths=1`)).status()).toBe(404);
    await page.goto(groupPath());
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto(groupPath());
    await expect(page).toHaveURL(/\/sign-in/);
  } finally { await context.close(); }
});

test("Dashboard selects an owned scope, reconciles reports, and opens group history", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 750 });
  await page.goto("/");
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  const navigation = drawer.getByRole("navigation", { name: "Main navigation" });
  await expect(drawer).toBeHidden();
  await openNavigation.click();
  await expect(navigation.getByRole("link")).toHaveText(["Dashboard", "Expense Groups", "Accounts", "Loans"]);
  await expect(navigation.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(openNavigation).toBeFocused();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const filters = page.getByRole("form", { name: "Dashboard filters" });
  const groupPicker = filters.locator("summary");
  await expect(filters.getByRole("button", { name: "Apply filters", exact: true })).toHaveCount(0);
  await groupPicker.press("Enter");
  await expect(groupPicker).toContainText("1 included");
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "Browser daily expenses", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Private foreign group" })).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Browser daily expenses", exact: true }).uncheck();
  await expect(page.getByRole("heading", { name: "No expense groups selected" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("scope")).toBe("1");
  await expect(groupPicker).toContainText("0 included");
  await page.getByRole("checkbox", { name: "Dashboard household", exact: true }).check();
  await expect(page.getByRole("region", { name: "Included expense groups" })).toContainText("Dashboard household");
  await page.getByRole("checkbox", { name: "Dashboard work", exact: true }).check();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("group").sort()).toEqual([
    data.dashboard.budgeted, data.dashboard.unbudgeted,
  ].sort());
  await expect(groupPicker).toContainText("2 included");
  await expect(page.getByRole("checkbox", { name: "Dashboard work", exact: true })).toBeChecked();
  await filters.getByLabel("Month", { exact: true }).fill(data.dashboard.month);
  await expect(page).toHaveURL((url) => url.searchParams.get("month") === data.dashboard.month);
  const spent = page.getByRole("region", { name: "Spent in April 2020" });
  await expect(spent.getByText("₱32.75", { exact: true })).toBeVisible();
  await expect(spent.getByText("₱7.25", { exact: true })).toBeVisible();
  const budget = page.getByRole("region", { name: "Budget progress" });
  await expect(budget).toContainText("1 of 2 groups budgeted");
  await expect(budget).toContainText("₱10.25 of ₱200.00");
  await expect(budget).toContainText("₱22.50 unbudgeted spending");
  await expect(page.getByText(/Scheduled internet/)).toBeVisible();
  await expect(page.getByText(/Review storage renewal/)).toBeVisible();
  const categories = page.getByRole("region", { name: "Spending by category" });
  await expect(categories.getByRole("link", { name: /Food/ })).toHaveCount(2);
  await expect(categories.getByRole("link", { name: /Dashboard household/ })).toHaveAttribute("href", /month=2020-04&category=\d+/);
  const merchants = page.getByRole("region", { name: "Spending by merchant" });
  await expect(merchants.getByRole("link", { name: /Local Market Dashboard work/ })).toHaveAttribute("href", /month=2020-04&merchant=[a-f0-9]{64}/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const entry = page.getByRole("region", { name: "Quick expense entry" });
  await entry.getByRole("combobox", { name: "Expense group", exact: true }).click();
  await entry.getByRole("option", { name: "Dashboard work", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("entry")).toBe(data.dashboard.unbudgeted);
  const expense = await newExpense(page);
  await expense.getByLabel("Title", { exact: true }).fill("Dashboard quick-entry ticket");
  await expense.getByLabel("Amount (PHP)", { exact: true }).fill("2.50");
  await expense.getByLabel("Date", { exact: true }).fill(`${data.dashboard.month}-08`);
  await expense.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(expense).not.toBeVisible();
  await expect(spent.getByText("₱35.25", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dashboard quick-entry ticket/ })).toBeVisible();

  const reportUrl = page.url();
  for (const title of ["Scheduled internet", "Review storage renewal"]) {
    await page.getByRole("link", { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(/\?tab=recurring#recurring-expense-\d+$/);
    const schedule = page.locator(new URL(page.url()).hash);
    await expect(schedule.getByRole("heading", { name: title, exact: true })).toBeInViewport();
    await page.goto(reportUrl);
  }

  const recent = page.getByRole("link", { name: /Work groceries/ });
  await recent.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/spending/${data.dashboard.unbudgeted}`);
  await expect(page).toHaveURL(/expense=\d+#expense-history-title$/);
  await expect(page.getByRole("heading", { name: "Work groceries", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard quick-entry ticket", exact: true })).toHaveCount(0);
  await openNavigation.click();
  await expect(navigation.getByRole("link", { name: "Expense Groups" })).toHaveAttribute("aria-current", "location");
  await drawer.getByRole("button", { name: "Close navigation" }).click();
  await expect(drawer).toBeHidden();

  await page.goto(`/?month=${data.dashboard.month}&scope=1&group=${data.foreign.publicId}`);
  await expect(page.getByRole("heading", { name: "No expense groups selected" })).toBeVisible();
  await groupPicker.click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(page.getByText("Foreign secret", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Spent in April 2020", exact: true })).toHaveCount(0);
});

test("phone workflow creates a group/category, preserves a failed draft, retries once, edits and deletes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/expense-groups");
  await page.getByRole("button", { name: /New.*Group/ }).click();
  const groupDialog = page.getByRole("dialog", { name: "New Expense Group" });
  await groupDialog.getByLabel("Name", { exact: true }).fill("Phone workflow");
  await groupDialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(groupDialog).not.toBeVisible();
  await page.getByRole("link", { name: /Phone workflow/ }).click();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "+ New Category", exact: true }).click();
  const category = page.getByRole("dialog", { name: "New Category", exact: true });
  await category.getByLabel("Name", { exact: true }).fill("Phone food");
  await category.getByRole("button", { name: "Create", exact: true }).click();
  await expect(category).not.toBeVisible();
  await page.getByRole("link", { name: "Expenses", exact: true }).click();
  await page.goto(`${new URL(page.url()).pathname}?allMonths=1`);
  const dialog = await newExpense(page);
  const save = dialog.getByRole("button", { name: "Save expense", exact: true });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await expect(save).toHaveCSS("min-height", "40px");
  await expect(cancel).toHaveCSS("min-height", "40px");
  await cancel.focus();
  await page.keyboard.press("Tab");
  await expect(save).toBeFocused();
  await expect(save).toHaveCSS("outline-width", "2px");
  await dialog.getByLabel("Title", { exact: true }).fill("Retry breakfast");
  await dialog.getByLabel("Merchant", { exact: false }).fill("Phone Cafe");
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("0");
  await dialog.getByLabel("Date", { exact: true }).fill("2026-11-18");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Retry breakfast");
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("0.10");

  let discarded = false;
  await page.route("**/spending/**", async (route) => {
    if (!discarded && isAction(route, "Retry breakfast")) {
      discarded = true;
      await route.fetch(); // Commit the real mutation, then simulate a lost response.
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Unable to save");
  await expect.poll(() => expenseCount("Retry breakfast")).toBe(1);
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await expenseCount("Retry breakfast")).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Retry breakfast", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit expense: Retry breakfast", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Expense", exact: true });
  await edit.getByLabel("Amount (PHP)", { exact: true }).fill("0.20");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect.poll(async () => (await db.query<{ amountCentavos: number }>(
    'SELECT "amountCentavos" FROM "Expense" WHERE title = $1', ["Retry breakfast"],
  )).rows[0]?.amountCentavos).toBe(20);
  await page.getByRole("button", { name: "Delete expense: Retry breakfast", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "Delete expense?", exact: true });
  await expect(deletion.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await deletion.getByRole("button", { name: "Delete expense", exact: true }).click();
  await expect(deletion).not.toBeVisible();
  await expect.poll(() => expenseCount("Retry breakfast")).toBe(0);
  await page.reload();
  await expect(page.getByText("No expenses yet", { exact: true })).toBeVisible();
});

test("empty expense group guides the first category and expense", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/expense-groups");
  await page.getByRole("button", { name: /New.*Group/ }).click();
  const groupDialog = page.getByRole("dialog", { name: "New Expense Group" });
  await groupDialog.getByLabel("Name", { exact: true }).fill("First expense workflow");
  await groupDialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(groupDialog).not.toBeVisible();
  await page.getByRole("link", { name: /First expense workflow/ }).click();

  const history = page.getByRole("region", { name: "Expenses", exact: true });
  await expect(history.getByText("No expenses yet", { exact: true })).toBeVisible();
  await expect(history.getByText("Select + New Category to start recording expenses.")).toBeVisible();
  await expect(history.getByRole("link", { name: "All months", exact: true })).toHaveCount(0);
  const expenseGroupUrl = page.url();
  await page.getByRole("button", { name: "+ New Category", exact: true }).click();
  const category = page.getByRole("dialog", { name: "New Category", exact: true });
  await category.getByLabel("Name", { exact: true }).fill("First category");
  await category.getByRole("button", { name: "Create", exact: true }).click();
  await expect(category).not.toBeVisible();
  await expect(page).toHaveURL(expenseGroupUrl);
  await expect(page.getByRole("navigation", { name: "Expense group views" })
    .getByRole("link", { name: "Expenses", exact: true })).toBeFocused();

  await expect(history.getByText("No expenses yet", { exact: true })).toBeVisible();
  await expect(history.getByText("Select + New Expense to add your first expense.")).toBeVisible();
  await expect(history.getByRole("link", { name: "All months", exact: true })).toHaveCount(0);
  const expense = await newExpense(page);
  await expense.getByLabel("Title", { exact: true }).fill("First bus ticket");
  await expense.getByLabel("Amount (PHP)", { exact: true }).fill("12.50");
  await expense.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(expense).not.toBeVisible();
  await expect(history.getByRole("heading", { name: "First bus ticket", exact: true })).toBeVisible();
});

test("empty current month offers older history", async ({ page }) => {
  await page.goto(`/spending/${data.olderHistory.publicId}`);
  const history = page.getByRole("region", { name: "Expenses", exact: true });
  const olderExpense = history.getByRole("cell", { name: "Older train ticket", exact: true });
  await expect(history.getByText("No expenses this month", { exact: true })).toBeVisible();
  await expect(olderExpense).toHaveCount(0);

  await history.getByRole("link", { name: "All months", exact: true }).click();
  await expect(page).toHaveURL(groupPath(data.olderHistory.publicId));
  await expect(olderExpense).toBeVisible();
  await expect(history.getByText("No expenses this month", { exact: true })).toHaveCount(0);
});

test("an owner can manage Banks and Pay Later settings for an expense group", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expense-groups/credit-accounts");
  await expect(page).toHaveURL("/expense-groups");
  await expect(page.getByRole("link", { name: "Pay Later Bills", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /New.*Group/ }).click();
  const create = page.getByRole("dialog", { name: "New Expense Group" });
  await create.getByLabel("Name", { exact: true }).fill("Unused bank group");
  await create.getByRole("button", { name: "Create", exact: true }).click();
  const groupLink = page.getByRole("link", { name: /Unused bank group/ });
  await groupLink.click();
  await page.getByRole("link", { name: "Payment Provider", exact: true }).click();

  const providers = page.getByRole("navigation", { name: "Payment provider views" });
  const banks = providers.getByRole("link", { name: "Banks", exact: true });
  const payLater = providers.getByRole("link", { name: "Pay Later", exact: true });
  await expect(banks).toHaveAttribute("aria-current", "page");
  await expect(payLater).toBeInViewport();
  const disabledBank = page.getByRole("button", { name: "BPI Not enabled", exact: true });
  await payLater.click();
  await expect(payLater).toHaveAttribute("aria-current", "page");
  await expect(disabledBank).toHaveCount(0);

  const disabledShopee = page.getByRole("button", { name: "Shopee Not enabled", exact: true });
  await expect(disabledShopee).toBeInViewport();
  await disabledShopee.click();
  const shopee = page.getByRole("dialog", { name: "Shopee", exact: true });
  const groupPayLater = shopee.getByLabel("Enable for this expense group");
  const savePayLater = shopee.getByRole("button", { name: "Save changes" });
  await expect(groupPayLater).not.toBeChecked();
  await groupPayLater.check();
  await savePayLater.click();
  const enabledShopee = page.getByRole("button", { name: "Shopee Enabled", exact: true });
  await expect(enabledShopee).toBeVisible();
  await page.reload();
  await expect(payLater).toHaveAttribute("aria-current", "page");
  await enabledShopee.click();
  await expect(groupPayLater).toBeChecked();
  await groupPayLater.uncheck();
  await savePayLater.click();
  await expect(disabledShopee).toBeVisible();

  await banks.click();
  await expect(banks).toHaveAttribute("aria-current", "page");
  await disabledBank.click();
  const bank = page.getByRole("dialog", { name: "BPI", exact: true });
  const enabled = bank.getByLabel("Enable for this expense group");
  await enabled.check();
  await bank.getByLabel("Debit card").check();
  await bank.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "BPI Enabled", exact: true }).click();
  await enabled.uncheck();
  await bank.getByRole("button", { name: "Save changes" }).click();
  await expect(disabledBank).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Delete Expense Group", exact: true }).click();
  const remove = page.getByRole("dialog", { name: "Delete expense group?" });
  await remove.getByRole("button", { name: "Delete group", exact: true }).click();
  await expect(page).toHaveURL("/expense-groups");
  await expect(page.getByRole("link", { name: /Browser daily expenses/ })).toBeVisible();
  await expect(groupLink).toHaveCount(0);
});

test("New Expense lists enabled Pay Later providers for the group and handles deletion", async ({ page }) => {
  await page.goto(groupPath());
  const groupViews = page.getByRole("navigation", { name: "Expense group views" });
  await groupViews.getByRole("link", { name: "Payment Provider", exact: true }).click();
  await page.getByRole("navigation", { name: "Payment provider views" })
    .getByRole("link", { name: "Pay Later", exact: true }).click();

  for (const provider of ["Lazada", "GCash", "Atome", "BillEase", "Home Credit"]) {
    await expect(page.getByRole("button", { name: `${provider} Not enabled`, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Lazada Not enabled", exact: true }).click();
  const lazada = page.getByRole("dialog", { name: "Lazada", exact: true });
  await lazada.getByLabel("Enable for this expense group").check();
  await lazada.getByRole("button", { name: "Save changes" }).click();
  await expect(lazada).toBeHidden();
  await expect(page.getByRole("button", { name: "Lazada Enabled", exact: true })).toBeVisible();

  await groupViews.getByRole("link", { name: "Expenses", exact: true }).click();
  const expense = await newExpense(page);
  await expense.getByRole("combobox", { name: "Payment method", exact: true }).click();
  await expense.getByRole("option", { name: "Pay Later", exact: true }).click();
  const creditProvider = expense.getByRole("combobox", { name: "Credit provider", exact: true });
  const account = expense.getByRole("combobox", { name: "Account", exact: true });
  const saveExpense = expense.getByRole("button", { name: "Save expense", exact: true });
  const eligibleOptions = expense.getByRole("option").and(expense.locator(':not([aria-disabled="true"])'));
  await expect(account).toHaveCount(0);
  await creditProvider.click();
  await expect(eligibleOptions).toHaveText(["Lazada"]);
  await expense.getByRole("option", { name: "Lazada", exact: true }).click();
  await expect(account).toHaveText("No Pay Later accounts available");
  await expect(account).toBeDisabled();
  await expect(expense.getByText(/Add a Pay Later account for Lazada/)).toContainText("Accounts → Add Account");
  await expect(saveExpense).toBeDisabled();

  async function openPayLaterWithNoProviders(publicId: string) {
    await page.goto(groupPath(publicId));
    await newExpense(page);
    await expense.getByRole("combobox", { name: "Payment method", exact: true }).click();
    await expense.getByRole("option", { name: "Pay Later", exact: true }).click();
    await expect(creditProvider).toHaveText("No credit providers available");
    await expect(creditProvider).toBeDisabled();
    await expect(saveExpense).toBeDisabled();
    await expect(account).toHaveCount(0);
  }

  await openPayLaterWithNoProviders(data.olderHistory.publicId);
  const help = expense.getByRole("button", { name: "How to enable a credit provider", exact: true });
  const instructions = expense.getByRole("tooltip");
  await help.hover();
  await expect(instructions).toBeVisible();
  await expect(instructions).toContainText(/Payment Provider.*Pay Later/);
  await expense.getByLabel("Title", { exact: true }).hover();
  await expect(instructions).toBeHidden();
  await expense.getByRole("combobox", { name: "Payment method", exact: true }).press("Tab");
  await expect(help).toBeFocused();
  await expect(instructions).toBeVisible();
  await help.press("Escape");
  await expect(instructions).toBeHidden();
  await expect(expense).toBeVisible();

  const lazadaAccount = "Browser Lazada installments";
  const customAccount = "Store installments account";
  const customProvider = "Neighborhood Shop Pay Later";
  await addPayLaterAccount(page, lazadaAccount, "Lazada");
  await addPayLaterAccount(page, customAccount, "Other", customProvider);

  await page.goto(groupPath());
  await newExpense(page);
  await expense.getByRole("combobox", { name: "Payment method", exact: true }).click();
  await expense.getByRole("option", { name: "Pay Later", exact: true }).click();
  await creditProvider.click();
  await expense.getByRole("option", { name: "Lazada", exact: true }).click();
  await account.click();
  await expect(eligibleOptions).toHaveText([lazadaAccount]);
  await expense.getByRole("option", { name: lazadaAccount, exact: true }).click();
  await expect(saveExpense).toBeEnabled();

  await page.goto("/accounts");
  const accountSettings = page.getByRole("button", { name: `Settings for ${lazadaAccount}`, exact: true });
  await accountSettings.click();
  await page.getByRole("button", { name: "Delete Account", exact: true }).click();
  const remove = page.getByRole("dialog", { name: "Delete account?", exact: true });
  await remove.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(accountSettings).toHaveCount(0);

  await page.goto(`/spending/${data.group.publicId}?tab=payment-providers&provider=pay-later`);
  await expect(page.getByRole("button", { name: "Lazada Enabled", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add credit provider", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `${customProvider} Not enabled`, exact: true }).click();
  const configure = page.getByRole("dialog", { name: customProvider, exact: true });
  await configure.getByLabel("Enable for this expense group").check();
  await configure.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(configure).toBeHidden();
  await expect(page.getByRole("button", { name: `${customProvider} Enabled`, exact: true })).toBeVisible();

  await groupViews.getByRole("link", { name: "Expenses", exact: true }).click();
  await newExpense(page);
  await expense.getByRole("combobox", { name: "Payment method", exact: true }).click();
  await expense.getByRole("option", { name: "Pay Later", exact: true }).click();
  await creditProvider.click();
  await expense.getByRole("option", { name: "Lazada", exact: true }).click();
  await expect(account).toHaveText("No Pay Later accounts available");
  await creditProvider.click();
  await expense.getByRole("option", { name: customProvider, exact: true }).click();
  await account.click();
  await expect(eligibleOptions).toHaveText([customAccount]);
});

test("Accounts lists owned accounts and enabling Shopee preserves the existing account", async ({ page }) => {
  const privateAccount = "Private browser savings fixture";
  await db.query(
    `INSERT INTO "FinancialAccount" ("userId", "name", "type", "updatedAt")
      SELECT "userId", $1, 'SAVINGS', CURRENT_TIMESTAMP FROM "Spending" WHERE "publicId" = $2::uuid`,
    [privateAccount, data.foreign.publicId],
  );

  await page.setViewportSize({ width: 1024, height: 844 });
  await page.goto("/");
  const accountsLink = page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Accounts", exact: true });
  await accountsLink.click();
  await expect(page).toHaveURL("/accounts");
  await expect(accountsLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(privateAccount, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add Account", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add Account", exact: true });
  await add.getByLabel("Account name", { exact: true }).fill("Browser BPI Savings");
  await expect(add.getByRole("combobox", { name: "Account type", exact: true })).toHaveText("Savings");
  await expect(add.getByLabel("Currency", { exact: true })).toHaveValue("PHP");
  await add.getByRole("combobox", { name: /^Bank/ }).click();
  await add.getByRole("option", { name: "BPI", exact: true }).click();
  await add.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(add).toBeHidden();
  await expect(page.getByText("Browser BPI Savings", { exact: true })).toBeVisible();
  const shopeeAccount = "Browser Shopee Credit";
  await addPayLaterAccount(page, shopeeAccount, "Shopee");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/spending/${data.olderHistory.publicId}?tab=payment-providers&provider=pay-later`);
  await page.getByRole("button", { name: "Shopee Not enabled", exact: true }).click();
  const shopee = page.getByRole("dialog", { name: "Shopee", exact: true });
  await shopee.getByLabel("Enable for this expense group").check();
  await shopee.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(shopee).toBeHidden();

  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  await drawer.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL("/accounts");
  await expect(page.getByRole("heading", { name: shopeeAccount, exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "SPayLater", exact: true })).toHaveCount(0);
  await expect(page.getByText("Browser BPI Savings", { exact: true })).toBeVisible();
  await expect(page.getByText(privateAccount, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const settings = page.getByRole("button", { name: "Settings for Browser BPI Savings", exact: true });
  await settings.press("ArrowDown");
  const editName = page.getByRole("button", { name: "Edit Name", exact: true });
  await expect(editName).toBeFocused();
  await editName.press("Enter");
  const rename = page.getByRole("dialog", { name: "Edit account name", exact: true });
  await expect(rename.getByLabel("Name", { exact: true })).toHaveValue("Browser BPI Savings");
  await rename.getByLabel("Name", { exact: true }).fill("Browser Emergency Savings");
  await rename.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(rename).toBeHidden();

  const renamedSettings = page.getByRole("button", { name: "Settings for Browser Emergency Savings", exact: true });
  const deleteOption = page.getByRole("button", { name: "Delete Account", exact: true });
  const remove = page.getByRole("dialog", { name: "Delete account?", exact: true });
  await renamedSettings.click();
  await deleteOption.click();
  const cancel = remove.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(renamedSettings).toBeFocused();
  await renamedSettings.click();
  await deleteOption.click();
  await remove.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(renamedSettings).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeFocused();
});

test("SPayLater purchases open their repayment schedules from Expenses", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const shopeeAccount = "SPayLater purchase account";
  await addPayLaterAccount(page, shopeeAccount, "Shopee");
  await page.goto("/expense-groups");
  await page.getByRole("button", { name: /New.*Group/ }).click();
  const groupDialog = page.getByRole("dialog", { name: "New Expense Group" });
  await groupDialog.getByLabel("Name", { exact: true }).fill("SPayLater browser group");
  await groupDialog.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: /SPayLater browser group/ }).click();
  await page.getByRole("button", { name: "+ New Category", exact: true }).click();
  const category = page.getByRole("dialog", { name: "New Category" });
  await category.getByLabel("Name", { exact: true }).fill("Shopping");
  await category.getByRole("button", { name: "Create", exact: true }).click();
  await expect(category).not.toBeVisible();

  const groupViews = page.getByRole("navigation", { name: "Expense group views" });
  const paymentProviders = groupViews.getByRole("link", { name: "Payment Provider", exact: true });
  const providerViews = page.getByRole("navigation", { name: "Payment provider views" });
  const payLater = providerViews.getByRole("link", { name: "Pay Later", exact: true });
  await paymentProviders.click();
  await payLater.click();
  await page.getByRole("button", { name: "Shopee Not enabled", exact: true }).click();
  const shopee = page.getByRole("dialog", { name: "Shopee", exact: true });
  await shopee.getByLabel("Enable for this expense group").check();
  await shopee.getByRole("button", { name: "Save changes" }).click();
  await expect(shopee).not.toBeVisible();

  await groupViews.getByRole("link", { name: "Expenses", exact: true }).click();
  const title = "SPayLater test purchase";
  const purchasedOn = "2026-11-18";
  const expense = await newExpense(page);
  await expense.getByLabel("Title", { exact: true }).fill(title);
  await expense.getByLabel("Amount (PHP)", { exact: true }).fill("125");
  await expense.getByLabel("Date", { exact: true }).fill(purchasedOn);
  await expense.getByRole("combobox", { name: "Payment method", exact: true }).click();
  await expense.getByRole("option", { name: "Pay Later", exact: true }).click();
  await expense.getByRole("combobox", { name: "Credit provider", exact: true }).click();
  await expense.getByRole("option", { name: "Shopee", exact: true }).click();
  await expense.getByRole("combobox", { name: "Account", exact: true }).click();
  await expense.getByRole("option", { name: shopeeAccount, exact: true }).click();
  const term = expense.getByRole("combobox", { name: "Term", exact: true });
  const receipt = expense.getByRole("heading", { name: "Receipt image (optional)", exact: true });
  const receiptShortcut = expense.getByRole("button", { name: "Go to receipt image", exact: true });
  await term.click();
  await expense.getByRole("option", { name: "24 installments", exact: true }).click();
  await receiptShortcut.press("Enter");
  await expect(receipt).toBeFocused();
  await expect(receipt).toBeInViewport();

  const phone = page.viewportSize()!;
  await page.setViewportSize({ width: 1185, height: 844 });
  await expect(receiptShortcut).toBeHidden();
  const [detailsX, scheduleX, receiptX] = await Promise.all([
    expense.getByLabel("Title", { exact: true }).evaluate((field) => field.getBoundingClientRect().left),
    term.evaluate((field) => field.getBoundingClientRect().left),
    receipt.evaluate((heading) => heading.getBoundingClientRect().left),
  ]);
  expect(detailsX).toBeLessThan(scheduleX);
  expect(scheduleX).toBeLessThan(receiptX);
  await term.click();
  await expense.getByRole("option", { name: "2 installments", exact: true }).click();
  await expense.getByLabel("Payment 2 amount (PHP)", { exact: true }).press("Tab");
  await expect(expense.getByRole("button", { name: "Paste Image", exact: true })).toBeFocused();
  await page.setViewportSize(phone);

  await expense.getByLabel("Payment 1 due date", { exact: true }).fill("2026-12-18");
  await expense.getByLabel("Payment 1 amount (PHP)", { exact: true }).fill("50");
  await expense.getByLabel("Payment 2 due date", { exact: true }).fill("2027-01-18");
  await expense.getByLabel("Payment 2 amount (PHP)", { exact: true }).fill("75");
  await expense.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(expense).not.toBeVisible();

  await paymentProviders.click();
  await payLater.click();
  await expect(payLater).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Shopee Enabled", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SPayLater Purchases", exact: true })).toHaveCount(0);

  await groupViews.getByRole("link", { name: "Expenses", exact: true }).click();
  await page.goto(`${new URL(page.url()).pathname}?allMonths=1`);
  await page.setViewportSize({ width: 1185, height: 844 });
  const history = page.getByRole("table", { name: "Expense history", exact: true });
  await expect(history.getByRole("columnheader", { name: "Payment Provider", exact: true })).toBeVisible();
  const purchaseRow = history.getByRole("row").filter({ hasText: title });
  await expect(purchaseRow.getByRole("cell", { name: "Shopee", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Grouped by day", exact: true }).click();
  const purchaseCard = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(purchaseCard.getByText("Shopee", { exact: true })).toBeVisible();
  const tableView = page.getByRole("link", { name: "Table", exact: true });
  await tableView.click();
  await expect(tableView).toHaveAttribute("aria-current", "page");
  await page.setViewportSize(phone);
  await expect(purchaseCard.getByText("Shopee", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View plan", exact: true }).click();
  await expect(page).toHaveURL(/\/loans\/plans\//);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repayment Schedule", exact: true })).toBeVisible();
  const schedule = page.getByRole("table").filter({ hasText: "Due Date" });
  await expect(schedule.getByRole("columnheader")).toHaveText(["Due Date", "Scheduled", "Remaining"]);
  await expect(schedule.getByRole("row", { name: /Dec 18, 2026/ }).getByRole("cell", { name: "₱50.00" })).toHaveCount(2);
  await expect(schedule.getByRole("row", { name: /Jan 18, 2027/ }).getByRole("cell", { name: "₱75.00" })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const payment = page.getByRole("region", { name: "Record Payment", exact: true });
  const paymentDate = payment.getByLabel("Payment date", { exact: true });
  const today = getManilaToday();
  await expect(paymentDate).toHaveAttribute("min", purchasedOn);
  await expect(paymentDate).toHaveAttribute("max", today);
  await paymentDate.fill("2026-11-17");
  expect(await paymentDate.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);

  const tomorrow = parseExpenseDate(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await paymentDate.fill(tomorrow.toISOString().slice(0, 10));
  expect(await paymentDate.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
  await payment.getByLabel("Paid from", { exact: true }).fill("Test wallet");
  const paymentForm = payment.locator("form");
  const recordPayment = payment.getByRole("button", { name: "Record Payment", exact: true });
  await paymentForm.evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await recordPayment.click();
  await expect(payment.getByRole("alert")).toHaveText("Payment date cannot be in the future.");
  await expect(page.getByText("No payments recorded.", { exact: true })).toBeVisible();
  await expect(schedule.getByRole("row", { name: /Dec 18, 2026/ }).getByRole("cell", { name: "₱50.00" })).toHaveCount(2);

  await paymentForm.evaluate((form: HTMLFormElement) => { form.noValidate = false; });
  await paymentDate.fill(purchasedOn);
  await recordPayment.click();
  await expect(payment.getByRole("status")).toHaveText("Payment recorded.");
  await expect(schedule.getByRole("row", { name: /Dec 18, 2026/ }).getByRole("cell", { name: "Paid", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Nov 18, 2026 Test wallet ₱50\.00/ })).toBeVisible();

  await page.getByRole("link", { name: "Back to Expense", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
});

test("a lost schedule response can be retried from the dialog and posts one expense", async ({ page }) => {
  const title = "Schedule retry regression";
  await page.goto(`/spending/${data.group.publicId}?tab=recurring`);
  await page.getByRole("button", { name: "+ New Recurring Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New recurring expense", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("15.25");
  await expect(dialog.getByRole("combobox", { name: "Category", exact: true })).toHaveText("Food");
  const startDay = await dialog.getByLabel("Start date", { exact: true }).inputValue();
  await dialog.getByLabel("End date (optional)", { exact: true }).fill(startDay);

  const createRequests: string[] = [];
  await page.route("**/spending/**", async (route) => {
    if (isAction(route, title)) {
      createRequests.push(route.request().postData()!);
      if (createRequests.length === 1) {
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  const save = dialog.getByRole("button", { name: "Create schedule", exact: true });
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("Unable to save");
  const submissions = await db.query<{ id: string }>(
    `SELECT submission.id FROM "RecurringExpenseSubmission" submission
     JOIN "RecurringExpense" rule ON rule.id = submission."recurringExpenseId"
     WHERE rule."expenseGroupId" = $1 AND rule.title = $2`, [data.group.id, title],
  );
  expect(submissions.rows).toHaveLength(1);
  await save.click();
  await expect(dialog).not.toBeVisible();
  expect(createRequests).toHaveLength(2);
  for (const request of createRequests) expect(request).toContain(submissions.rows[0].id);
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: "Run due expenses", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 expense posted." })).toBeVisible();
  expect(await expenseCount(title, data.group.id)).toBe(1);
});

test("live expense search debounces changes and filters history, pagination, and CSV export", async ({ page }) => {
  await page.goto(groupPath(data.merchants.publicId));
  const form = page.getByRole("form", { name: "Expense history filters" });
  const search = form.getByRole("searchbox", { name: "Search expenses", exact: true });
  await expect(form.getByRole("button", { name: "Apply filters", exact: true })).toHaveCount(0);
  await expect(form.locator("input:not([type=hidden])").first()).toHaveAttribute("type", "search");

  const searchTerms = new Set<string>();
  page.on("request", (request) => {
    const term = new URL(request.url()).searchParams.get("search");
    if (term) searchTerms.add(term);
  });
  const clockStart = Date.now();
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(clockStart + 1_000);
  await search.fill("mEr");
  await page.clock.runFor(200);
  await search.fill("mErChAnT");
  const category = form.getByRole("combobox", { name: "Category", exact: true });
  await category.press("End");
  await category.press("Enter");
  await expect(page).toHaveURL(/[?&]category=\d+/);
  const categoryId = new URL(page.url()).searchParams.get("category");
  await page.clock.runFor(299);
  expect(searchTerms.size).toBe(0);
  await search.focus();
  await page.clock.runFor(1);
  await page.clock.resume();
  await expect(page).toHaveURL(/[?&]search=mErChAnT/);
  expect([...searchTerms]).toEqual(["mErChAnT"]);
  expect(new URL(page.url()).searchParams.get("category")).toBe(categoryId);
  await expect(search).toBeFocused();
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
  await expect(search).toHaveValue("mErChAnT");
  const download = await exportExpenses(page);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.match(/Merchant \d{2} purchase/g)).toHaveLength(30);
  expect(csv).not.toContain("Alpha Bakery");

  await search.fill("29 purchase");
  await expect(page.getByRole("cell", { name: /^Merchant 29 purchase/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^Alpha Bakery purchase/ })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(search).toBeFocused();

  await search.fill("does not exist");
  await expect(page.getByText("No expenses match these filters")).toBeVisible();

  await search.clear();
  await expect(page.getByRole("link", { name: "Next", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("search")).toBe(false);

  const day = form.locator('input[name="day"]');
  const month = form.locator('input[name="month"]');
  await day.fill("2026-11-17");
  await expect(page).toHaveURL(/[?&]day=2026-11-17/);
  await expect(page.getByText("No expenses match these filters")).toBeVisible();
  await expect(month).toHaveValue("2026-11");
  await day.clear();
  await expect(page).toHaveURL(/[?&]month=2026-11/);
  await expect(page.getByRole("link", { name: "Next", exact: true })).toBeVisible();
  await day.fill("2026-11-18");
  await expect(page).toHaveURL(/[?&]day=2026-11-18/);
  await month.fill("2026-10");
  await expect(page).toHaveURL(/[?&]month=2026-10/);
  expect(new URL(page.url()).searchParams.has("day")).toBe(false);
  await expect(day).toHaveValue("");
  await expect(page.getByText("No expenses match these filters")).toBeVisible();
});

test("an exact merchant link retains its filter until the text is edited", async ({ page }) => {
  const merchant = createHash("sha256").update("beta cafe").digest("hex");
  await page.goto(`${groupPath(data.merchants.publicId)}&merchant=${merchant}`);
  const search = page.getByRole("searchbox", { name: "Search expenses", exact: true });
  await expect(search).toHaveValue("Beta Cafe");
  await page.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByRole("option", { name: "Shopping", exact: true }).click();
  await expect(page).toHaveURL(/[?&]category=\d+/);
  await expect(page.getByRole("cell", { name: /^Beta Cafe purchase/ })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]merchant=${merchant}(&|$)`));
  await search.fill("bakery");
  await expect(search).toHaveAttribute("name", "search");
  await expect(page).toHaveURL(/[?&]search=bakery/);
  await expect(page.getByRole("cell", { name: /^Alpha Bakery purchase/ })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("merchant")).toBe(false);
});

test("expense payment and bank filters apply immediately and can be cleared", async ({ page }) => {
  await page.goto(groupPath(data.merchants.publicId));
  const form = page.getByRole("form", { name: "Expense history filters" });
  const payment = form.getByRole("combobox", { name: "Payment method", exact: true });
  const bank = form.getByRole("combobox", { name: "Bank", exact: true });
  const alpha = page.getByRole("cell", { name: /^Alpha Bakery purchase/ });

  await payment.click();
  await form.getByRole("option", { name: "Cash", exact: true }).click();
  await expect(page).toHaveURL(/[?&]paymentMethod=CASH/);
  await expect(alpha).toHaveCount(0);
  await expect(payment).toBeFocused();

  await bank.click();
  await form.getByRole("option", { name: "Browser Test Bank (recorded name)", exact: true }).click();
  await expect(page).toHaveURL(/[?&]bank=legacy%3A[a-f0-9]{64}/);
  await payment.click();
  await form.getByRole("option", { name: "All payment methods", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has("paymentMethod")).toBe(false);
  await expect(alpha).toHaveCount(0);
  await expect(page.getByRole("cell", { name: /^Beta Cafe purchase/ })).toBeVisible();
  const bankExpense = page.getByRole("row").filter({ hasText: "Beta Cafe purchase" });
  await expect(bankExpense.getByRole("cell", { name: "Browser Test Bank", exact: true })).toBeVisible();

  await form.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(bank).toHaveText("All banks");
  expect(new URL(page.url()).searchParams.has("bank")).toBe(false);
});

test("CSV merchant mapping survives an uncertain save and an idempotent retry", async ({ page }) => {
  await page.goto(groupPath());
  await page.getByRole("button", { name: "Import Expenses", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import Expenses", exact: true });
  await dialog.getByLabel("Expense file", { exact: true }).setInputFiles({
    name: "merchant-import.csv", mimeType: "text/csv",
    buffer: Buffer.from("Date,Description,Amount,Merchant\n2026-11-18,Imported lunch,0.10,Import Cafe\n2026-11-18,Imported lunch,0.10,Other Cafe\n"),
  });
  await expect(dialog.getByRole("combobox", { name: "Description column", exact: true })).toHaveText("Description (column 2)");
  await expect(dialog.getByRole("combobox", { name: "Merchant (optional) column", exact: true })).toHaveText("Merchant (column 4)");
  await dialog.getByRole("combobox", { name: "Category for selected expenses", exact: true }).click();
  await dialog.getByRole("listbox").getByRole("option", { name: "Food", exact: true }).click();
  await dialog.getByRole("button", { name: "Preview expenses", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Expense preview" })).toBeFocused();
  await expect(dialog.getByText("Import Cafe", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Other Cafe", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Similar row in this file", { exact: true })).toHaveCount(0);
  let discarded = false;
  await page.route("**/spending/**", async (route) => {
    if (!discarded && isAction(route, "Imported lunch")) {
      discarded = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Import 2 expenses", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Unable to confirm");
  await expect.poll(() => expenseCount("Imported lunch", data.group.id)).toBe(2);
  await dialog.getByRole("button", { name: "Import 2 expenses", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const expenses = await db.query(
    'SELECT merchant, "amountCentavos" FROM "Expense" WHERE "expenseGroupId" = $1 AND title = $2 ORDER BY merchant',
    [data.group.id, "Imported lunch"],
  );
  expect(expenses.rows).toEqual([
    { merchant: "Import Cafe", amountCentavos: 10 }, { merchant: "Other Cafe", amountCentavos: 10 },
  ]);
  await page.reload();
  const download = await exportExpenses(page);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Import Cafe");
  expect(csv).toContain("Other Cafe");
});

test("CSV download includes all filtered rows beyond the visible history page", async ({ page }) => {
  await page.goto(groupPath(data.exported.publicId));
  await expect(page.getByRole("link", { name: "Next", exact: true })).toBeVisible();
  const download = await exportExpenses(page);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.match(/Export expense /g)).toHaveLength(35);
  expect(csv).not.toContain("Foreign secret");
  await page.goto(`/spending/${data.exported.publicId}?day=2026-11-17`);
  const emptyDownload = await exportExpenses(page);
  const emptyCsv = await readFile((await emptyDownload.path())!, "utf8");
  expect(emptyCsv.trim().split(/\r?\n/)).toHaveLength(1);
});

test("export dialog offers PDF and Excel downloads and restores focus on dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(groupPath(data.exported.publicId));
  const trigger = page.getByRole("button", { name: "Export Expenses", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Export Expenses", exact: true });
  await expect(dialog.getByRole("radio", { name: /CSV/ })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: /PDF/ })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Excel/ })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  const pdf = await exportExpenses(page, "PDF (.pdf)");
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfBytes = await readFile((await pdf.path())!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(pdfBytes), useWasm: false, disableFontFace: true });
  try {
    const document = await loading.promise;
    let text = "";
    let coloredPixels = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const pdfPage = await document.getPage(number);
      const content = await pdfPage.getTextContent();
      text += content.items.map((item) => "str" in item ? item.str : "").join("");
      if (content.items.some((item) => "str" in item && item.str.includes("🍱"))) {
        const viewport = pdfPage.getViewport({ scale: 2 });
        const factory = document.canvasFactory as {
          create(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };
          destroy(target: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }): void;
        };
        const target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await pdfPage.render({ canvas: target.canvas, canvasContext: target.context, viewport }).promise;
          const pixels = target.context.getImageData(0, 0, target.canvas.width, target.canvas.height).data;
          for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
            if (Math.max(red, green, blue) - Math.min(red, green, blue) > 40) coloredPixels++;
          }
        } finally { factory.destroy(target); }
      }
    }
    for (const value of ["午餐🍱中文", "台灣商店🛒𠮷野家", "コーヒー・スーパー", "한국어", "👩🏽‍💻", "🇵🇭"]) {
      expect(text.replace(/\s/gu, "")).toContain(value);
    }
    expect(text).not.toMatch(/[\u0000\uFFFD]/u);
    expect(coloredPixels).toBeGreaterThan(20);
  } finally { await loading.destroy(); }
  const excel = await exportExpenses(page, "Excel (.xlsx)");
  expect(excel.suggestedFilename()).toMatch(/\.xlsx$/);
  const rows = await readSheet((await excel.path())!);
  expect(rows).toHaveLength(36);
  expect(JSON.stringify(rows)).toContain("Export expense 35");
  expect(JSON.stringify(rows)).not.toContain("Foreign secret");
  await page.goto(`/spending/${data.exported.publicId}?day=2026-11-17`);
  const empty = await exportExpenses(page, "Excel (.xlsx)");
  expect(await readSheet((await empty.path())!)).toHaveLength(1);
});

test("downloads a complete 5,000-row PDF with readable page breaks", async ({ page }, testInfo) => {
  await page.goto(`/spending/${data.largeExport.publicId}?day=2026-11-18`);
  await expect(page.getByRole("link", { name: "Next", exact: true })).toBeVisible();
  const download = await exportExpenses(page, "PDF (.pdf)");
  expect(download.suggestedFilename()).toBe(`expenses-${data.largeExport.publicId}.pdf`);
  const report = testInfo.outputPath("large-expense-report.pdf");
  await download.saveAs(report);

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(await readFile(report)), useWasm: false, disableFontFace: true });
  try {
    const document = await loading.promise;
    const expenseIds: number[] = [];
    let receiptStartPage = 0;
    let receiptEndPage = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const pdfPage = await document.getPage(pageNumber);
      const content = await pdfPage.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
      if (pageNumber === 1) {
        expect(text).toContain("Expense count: 5000");
        expect(text).toContain("Total: PHP 6150.00");
      }
      expect(text).not.toContain("Outside report date");
      if (text.includes("Receipt starts here")) receiptStartPage = pageNumber;
      if (text.includes("Receipt ends here")) receiptEndPage = pageNumber;

      const sections = text.split(/Large report expense (\d{4})/g);
      for (let index = 1; index < sections.length; index += 2) {
        const id = Number(sections[index]);
        expenseIds.push(id);
        expect(sections[index + 1], `Opening details for expense ${id} on page ${pageNumber}`)
          .toContain("Date: 2026-11-18");
      }
      pdfPage.cleanup();
    }
    expect(expenseIds).toEqual(Array.from({ length: 5_000 }, (_, index) => index + 1));
    expect(receiptStartPage).toBeGreaterThan(0);
    expect(receiptEndPage).toBeGreaterThan(receiptStartPage);
  } finally { await loading.destroy(); }
});

test("failed exports keep the dialog open for retry and invalid formats are rejected", async ({ page }) => {
  await page.goto(groupPath(data.exported.publicId));
  const exportPath = `/spending/${data.exported.publicId}/export`;
  for (const format of ["invalid", "csv&format=pdf"]) {
    const response = await page.request.get(`${exportPath}?format=${format}`);
    expect(response.status()).toBe(400);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  const pattern = "**/export?**";
  await page.route(pattern, (route) => route.fulfill({ status: 500, body: "Export failed" }));
  await page.getByRole("button", { name: "Export Expenses", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Expenses", exact: true });
  await dialog.getByRole("button", { name: "Download", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Unable to export expenses");
  await expect(dialog.getByRole("radio", { name: /CSV/ })).toBeChecked();
  await page.unroute(pattern);
  const [download] = await Promise.all([
    page.waitForEvent("download"), dialog.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(await download.failure()).toBeNull();
  await expect(dialog).not.toBeVisible();
});

test("receipt OCR loads the real local worker, applies suggestions, and cancels a late scan", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 430, height: 800 });
  await page.goto(groupPath());
  const receipt = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1100; canvas.height = 650;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black"; context.font = "48px Arial";
    ["Merchant: Pine Street Cafe", "Title: Team lunch", "Date: 2026-11-18", "Time: 14:30", "Total Paid: PHP 150.75"]
      .forEach((line, index) => context.fillText(line, 60, 95 + index * 105));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const image = { name: "synthetic-receipt.png", mimeType: "image/png", buffer: Buffer.from(receipt, "base64") };
  const assets = new Set<string>();
  const aiScans: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/receipt-scan") aiScans.push(request.url());
  });
  page.on("response", (response) => {
    if (response.url().includes("/receipt-ocr/") && response.ok()) assets.add(new URL(response.url()).pathname);
  });
  const dialog = await newExpense(page);
  await dialog.getByLabel("Title", { exact: true }).fill("Manual title stays until applied");
  await dialog.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles(image);
  await expect(dialog.getByRole("button", { name: "Use amount", exact: true })).toBeVisible({ timeout: 45_000 });
  expect([...assets].some((asset) => asset.endsWith("worker.min.js"))).toBe(true);
  expect([...assets].some((asset) => asset.includes(".wasm"))).toBe(true);
  await dialog.getByRole("button", { name: "Set up AI scanning" }).click();
  const setup = page.getByRole("dialog", { name: "Receipt scanning settings" });
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(setup).not.toBeVisible();
  await expect(dialog.getByRole("img", { name: "Receipt image preview" })).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Manual title stays until applied");
  await dialog.getByRole("button", { name: "Use merchant", exact: true }).click();
  await dialog.getByRole("button", { name: "Use amount", exact: true }).click();
  await dialog.getByRole("button", { name: "Use date", exact: true }).click();
  await dialog.getByRole("button", { name: "Use time", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Merchant (optional)", exact: true })).toHaveValue("Pine Street Cafe");
  await expect(dialog.getByLabel("Amount (PHP)", { exact: true })).toHaveValue("150.75");
  await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue("2026-11-18");
  await expect(dialog.getByLabel("Time (Manila, optional)", { exact: true })).toHaveValue("14:30");
  expect(aiScans).toHaveLength(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const workerReady = deferred();
  const releaseWorker = deferred();
  await page.route("**/receipt-ocr/v7.0.0/worker.min.js", async (route) => {
    const response = await route.fetch();
    workerReady.resolve();
    await releaseWorker.promise;
    await route.fulfill({ response }).catch(() => {});
  });
  const canceled = await newExpense(page);
  try {
    await canceled.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles(image);
    await workerReady.promise;
    await canceled.getByRole("button", { name: "Cancel", exact: true }).click();
    releaseWorker.resolve();
    await expect(canceled).not.toBeVisible();
    const reopened = await newExpense(page);
    await expect(reopened.getByLabel("Title", { exact: true })).toHaveValue("");
    await expect(reopened.getByRole("button", { name: "Use amount", exact: true })).toHaveCount(0);
    await reopened.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await expenseCount("Manual title stays until applied")).toBe(0);
  } finally { releaseWorker.resolve(); }
});
