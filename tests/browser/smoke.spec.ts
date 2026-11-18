import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { test as base, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
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

test("phone workflow creates a group/category, preserves a failed draft, retries once, edits and deletes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/");
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

test("merchant search debounces input and discards a stale server response", async ({ page }) => {
  await page.goto(groupPath(data.merchants.publicId));
  const search = page.getByRole("searchbox", { name: "Search merchants", exact: true });
  const merchant = page.getByLabel("Merchant", { exact: true });
  await search.fill("Merchant 29");
  await expect(merchant.locator("option")).toHaveText(["All merchants", "No merchant", "Merchant 29"]);
  await page.clock.install();
  const alphaReady = deferred();
  const releaseAlpha = deferred();
  const betaReady = deferred();
  const releaseBeta = deferred();
  let alphaRequests = 0;
  await page.route("**/spending/**", async (route) => {
    if (isAction(route, '"Alpha"')) {
      alphaRequests++;
      const response = await route.fetch();
      alphaReady.resolve();
      await releaseAlpha.promise;
      await route.fulfill({ response });
    } else if (isAction(route, '"Beta"')) {
      const response = await route.fetch();
      betaReady.resolve();
      await releaseBeta.promise;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await search.fill("A");
    await page.clock.runFor(100);
    await search.fill("Al");
    await page.clock.runFor(100);
    await search.fill("Alpha");
    await page.clock.runFor(299);
    expect(alphaRequests).toBe(0);
    await page.clock.runFor(1);
    await alphaReady.promise;
    expect(alphaRequests).toBe(1);
    await search.fill("Beta");
    await page.clock.runFor(300);
    releaseAlpha.resolve();
    await betaReady.promise;
    await expect(merchant.locator("option")).toHaveText(["All merchants", "No merchant", "Merchant 29"]);
    releaseBeta.resolve();
    await expect(merchant.locator("option")).toHaveText(["All merchants", "No merchant", "Beta Cafe"]);
    await merchant.selectOption({ label: "Beta Cafe" });
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page).toHaveURL(/merchant=[a-f0-9]{64}/);
    expect(new URL(page.url()).searchParams.has("search")).toBe(false);
    await expect(page.getByRole("cell", { name: /^Beta Cafe purchase/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /^Alpha Bakery purchase/ })).toHaveCount(0);
  } finally {
    releaseAlpha.resolve();
    releaseBeta.resolve();
    await page.clock.resume();
  }
});

test("CSV merchant mapping survives an uncertain save and an idempotent retry", async ({ page }) => {
  await page.goto(groupPath());
  await page.getByRole("button", { name: "Import Expenses", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import Expenses", exact: true });
  await dialog.getByLabel("Expense file", { exact: true }).setInputFiles({
    name: "merchant-import.csv", mimeType: "text/csv",
    buffer: Buffer.from("Date,Description,Amount,Merchant\n2026-11-18,Imported lunch,0.10,Import Cafe\n2026-11-18,Imported lunch,0.10,Other Cafe\n"),
  });
  await expect(dialog.getByRole("combobox", { name: "Description column", exact: true })).toHaveValue("1");
  await expect(dialog.getByRole("combobox", { name: "Merchant (optional) column", exact: true })).toHaveValue("3");
  await dialog.getByRole("combobox", { name: "Category for selected expenses", exact: true }).selectOption(String(data.group.categoryId));
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
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV", exact: true }).click(),
  ]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Import Cafe");
  expect(csv).toContain("Other Cafe");
});

test("CSV download includes all filtered rows beyond the visible history page", async ({ page }) => {
  await page.goto(groupPath(data.exported.publicId));
  await expect(page.getByRole("link", { name: "Next", exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV", exact: true }).click(),
  ]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.match(/Export expense /g)).toHaveLength(35);
  expect(csv).not.toContain("Foreign secret");
  await page.goto(`/spending/${data.exported.publicId}?day=2026-11-17`);
  const [emptyDownload] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV", exact: true }).click(),
  ]);
  const emptyCsv = await readFile((await emptyDownload.path())!, "utf8");
  expect(emptyCsv.trim().split(/\r?\n/)).toHaveLength(1);
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
  page.on("response", (response) => {
    if (response.url().includes("/receipt-ocr/") && response.ok()) assets.add(new URL(response.url()).pathname);
  });
  const dialog = await newExpense(page);
  await dialog.getByLabel("Title", { exact: true }).fill("Manual title stays until applied");
  await dialog.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles(image);
  await expect(dialog.getByRole("button", { name: "Use amount", exact: true })).toBeVisible({ timeout: 45_000 });
  expect([...assets].some((asset) => asset.endsWith("worker.min.js"))).toBe(true);
  expect([...assets].some((asset) => asset.includes(".wasm"))).toBe(true);
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Manual title stays until applied");
  await dialog.getByRole("button", { name: "Use merchant", exact: true }).click();
  await dialog.getByRole("button", { name: "Use amount", exact: true }).click();
  await dialog.getByRole("button", { name: "Use date", exact: true }).click();
  await dialog.getByRole("button", { name: "Use time", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Merchant (optional)", exact: true })).toHaveValue("Pine Street Cafe");
  await expect(dialog.getByLabel("Amount (PHP)", { exact: true })).toHaveValue("150.75");
  await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue("2026-11-18");
  await expect(dialog.getByLabel("Time (Manila, optional)", { exact: true })).toHaveValue("14:30");
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
