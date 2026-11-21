import { Pool } from "pg";
import { test, expect, type Locator } from "@playwright/test";
import { browserData } from "./data";

const data = browserData();
const db = new Pool({ connectionString: process.env.REDTALLY_BROWSER_DATABASE_URL, ssl: false, max: 1 });
let group: { id: number; publicId: string };
let assignments: { id: number; name: string }[];

test.beforeAll(async () => {
  group = (await db.query<{ id: number; publicId: string }>(
    'INSERT INTO "Spending" (name, "userId", "updatedAt") VALUES ($1, $2, now()) RETURNING id, "publicId"',
    ["Bank dropdown browser tests", data.userId],
  )).rows[0];
  await db.query('INSERT INTO "Category" (name, "spendingId") VALUES ($1, $3), ($2, $3)',
    ["Bank test category", "Secondary test category", group.id]);
  assignments = [];
  for (const name of ["Browser Alpha Bank", "Browser Zulu Bank"]) {
    const bank = (await db.query<{ id: number }>(
      'INSERT INTO "Bank" (name, key, "updatedAt") VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [name, name.toLowerCase()],
    )).rows[0];
    const assignment = (await db.query<{ id: number }>(
      'INSERT INTO "ExpenseGroupBank" ("expenseGroupId", "bankId", "updatedAt") VALUES ($1, $2, now()) RETURNING id',
      [group.id, bank.id],
    )).rows[0];
    assignments.push({ id: assignment.id, name });
  }
  await db.query('UPDATE "ExpenseGroupBank" SET "supportedCreditCard" = false WHERE id = $1', [assignments[0].id]);
});

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN! },
    data: { email: data.email, password: data.password },
  });
  expect(response.ok()).toBe(true);
  await page.goto(`/spending/${group.publicId}?allMonths=1`);
});

test.afterAll(async () => { await db.end(); });

async function choosePaymentMethod(dialog: Locator, label: string) {
  await dialog.getByRole("combobox", { name: "Payment method", exact: true }).click();
  await dialog.getByRole("listbox").getByRole("option", { name: label, exact: true }).click();
}

test("payment provider dropdown supports keyboard selection, cancellation, and saving the bank", async ({ page }) => {
  await page.getByRole("button", { name: "+ New Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
  const bank = dialog.getByRole("combobox", { name: "Payment provider", exact: true });
  await expect(bank).toBeDisabled();
  await choosePaymentMethod(dialog, "Debit card");
  await expect(bank).toBeEnabled();
  await bank.press("ArrowDown");
  await expect(bank).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByRole("listbox")).toBeVisible();
  for (const name of ["No bank", ...assignments.map(({ name }) => name)]) {
    await expect(dialog.getByRole("option", { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath("bank-menu-desktop.png") });
  await bank.press("End");
  await bank.press("Enter");
  await expect(bank).toHaveText(assignments[1].name);
  await expect(bank).toHaveAttribute("aria-expanded", "false");
  await expect(bank).toBeFocused();

  await bank.press("Space");
  await bank.press("Home");
  await bank.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(bank).toHaveAttribute("aria-expanded", "false");
  await expect(bank).toHaveText(assignments[1].name);
  await expect(bank).toBeFocused();

  await bank.press("Enter");
  await bank.press("b");
  await bank.press("Enter");
  await expect(bank).toHaveText(assignments[0].name);
  await dialog.getByLabel("Title", { exact: true }).fill("Keyboard bank selection");
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("1.25");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await db.query<{ bankAssignmentId: number }>(
    'SELECT "bankAssignmentId" FROM "Expense" WHERE "expenseGroupId" = $1 AND title = $2',
    [group.id, "Keyboard bank selection"],
  )).rows[0]?.bankAssignmentId).toBe(assignments[0].id);
  const actions = page.getByRole("button", { name: "Actions for Keyboard bank selection", exact: true });
  const editAction = page.getByRole("button", { name: "Edit expense: Keyboard bank selection", exact: true });
  const deleteAction = page.getByRole("button", { name: "Delete expense: Keyboard bank selection", exact: true });
  await actions.press("ArrowDown");
  await expect(editAction).toBeFocused();
  // Focusing the trigger can queue a scroll notification that arrives after the menu opens.
  await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
  await page.keyboard.press("End");
  await expect(deleteAction).toBeFocused();
  await page.keyboard.press("Home");
  await expect(editAction).toBeFocused();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("dialog", { name: "Edit Expense", exact: true });
  await expect(edit.getByRole("combobox", { name: "Payment method", exact: true })).toHaveText("Debit card");
  await expect(edit.getByRole("combobox", { name: "Payment provider", exact: true })).toHaveText(assignments[0].name);
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(actions).toBeFocused();
  await expect(actions).toHaveAttribute("aria-expanded", "false");

  await db.query('UPDATE "ExpenseGroupBank" SET active = false WHERE id = $1', [assignments[0].id]);
  try {
    await page.reload();
    await page.getByRole("button", { name: "Actions for Keyboard bank selection", exact: true }).click();
    await page.getByRole("button", { name: "Edit expense: Keyboard bank selection", exact: true }).click();
    const historicalBank = edit.getByRole("combobox", { name: "Payment provider", exact: true });
    await choosePaymentMethod(edit, "Debit card");
    await expect(historicalBank).toHaveText(`${assignments[0].name} (previously selected)`);
    await historicalBank.click();
    await expect(edit.getByRole("option", { name: `${assignments[0].name} (previously selected)`, exact: true }))
      .toHaveAttribute("aria-disabled", "true");
    await historicalBank.press("Home");
    await historicalBank.press("ArrowDown");
    await historicalBank.press("Alt+ArrowUp");
    await expect(historicalBank).toHaveText(assignments[1].name);
    await expect(historicalBank).toHaveAttribute("aria-expanded", "false");
    await expect(edit).toBeVisible();
    expect((await db.query<{ bankAssignmentId: number }>(
      'SELECT "bankAssignmentId" FROM "Expense" WHERE "expenseGroupId" = $1 AND title = $2',
      [group.id, "Keyboard bank selection"],
    )).rows[0].bankAssignmentId).toBe(assignments[0].id);
  } finally {
    await db.query('UPDATE "ExpenseGroupBank" SET active = true WHERE id = $1', [assignments[0].id]);
  }
});

test("payment provider menu fits mobile and updates when the method changes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.getByRole("button", { name: "+ New Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
  const bank = dialog.getByRole("combobox", { name: "Payment provider", exact: true });
  await choosePaymentMethod(dialog, "Debit card");
  await bank.click();
  const menu = dialog.getByRole("listbox");
  const bounds = await menu.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  await page.screenshot({ path: test.info().outputPath("bank-menu-mobile.png") });
  await bank.press("Tab");
  await expect(menu).not.toBeVisible();
  await expect(bank).not.toBeFocused();
  await bank.click();
  await menu.getByRole("option", { name: assignments[1].name, exact: true }).click();
  await choosePaymentMethod(dialog, "Credit card");
  await expect(bank).toHaveText(assignments[1].name);
  await choosePaymentMethod(dialog, "Debit card");
  await bank.click();
  await menu.getByRole("option", { name: assignments[0].name, exact: true }).click();
  await choosePaymentMethod(dialog, "Credit card");
  await expect(bank).toHaveText("No bank");
  await bank.click();
  await expect(menu.getByRole("option", { name: assignments[0].name, exact: true })).toHaveCount(0);
  await expect(menu.getByRole("option", { name: assignments[1].name, exact: true })).toBeVisible();
  await dialog.getByLabel("Title", { exact: true }).click();
  await expect(menu).not.toBeVisible();
  await choosePaymentMethod(dialog, "Cash");
  await expect(bank).toBeDisabled();
  await expect(bank).toHaveText("No provider");
  await choosePaymentMethod(dialog, "Debit card");
  await expect(bank).toHaveText("No bank");
  await dialog.getByLabel("Title", { exact: true }).fill("Debit without a bank");
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("1.25");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db.query(
    'SELECT "transactionType", "bankAssignmentId" FROM "Expense" WHERE "expenseGroupId" = $1 AND title = $2',
    [group.id, "Debit without a bank"],
  )).rows).toEqual([{ transactionType: "DEBIT_CARD", bankAssignmentId: null }]);
});

test("recurring expense defaults to the first category and saves a different category and bank", async ({ page }) => {
  await page.getByRole("link", { name: "Recurring", exact: true }).click();
  await page.getByRole("button", { name: "+ New Recurring Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New recurring expense", exact: true });
  const method = dialog.getByRole("combobox", { name: "Payment method", exact: true });
  const bank = dialog.getByRole("combobox", { name: "Payment provider", exact: true });
  await expect(bank).toBeDisabled();
  await expect(bank).toHaveText("No provider");
  await dialog.getByLabel("Title", { exact: true }).fill("Recurring bank selection");
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("2.50");
  await dialog.getByLabel("Start date", { exact: true }).fill("2099-01-01");
  const create = dialog.getByRole("button", { name: "Create schedule", exact: true });
  const category = dialog.getByRole("combobox", { name: "Category", exact: true });
  const submitted = () => db.query<{ bankAssignmentId: number | null; category: string }>(
    'SELECT r."bankAssignmentId", c.name AS category FROM "RecurringExpense" r JOIN "Category" c ON c.id = r."categoryId" WHERE r."expenseGroupId" = $1 AND r.title = $2',
    [group.id, "Recurring bank selection"],
  );
  await expect(category).toHaveText("Bank test category");
  await category.press("Home");
  await category.press("Enter");
  await expect(category).toHaveText("Select a category");

  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) submissions++;
  });
  await create.click();
  await expect(category).toBeFocused();
  await expect(category).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("listbox").getByRole("option", { name: "Bank test category", exact: true })).toBeVisible();
  expect((await submitted()).rows).toEqual([]);
  expect(submissions).toBe(0);

  await category.press("End");
  await category.press("Enter");
  await expect(category).toHaveText("Secondary test category");
  await expect(category).not.toHaveAttribute("aria-invalid", "true");
  await method.click();
  const options = dialog.getByRole("listbox");
  await expect(options.getByRole("option", { name: "Pay Later", exact: true })).toHaveCount(0);
  await options.getByRole("option", { name: "Credit card", exact: true }).click();
  await bank.click();
  await expect(options.getByRole("option", { name: assignments[0].name, exact: true })).toHaveCount(0);
  await expect(options.getByRole("option", { name: assignments[1].name, exact: true })).toBeVisible();
  await bank.press("Escape");
  await choosePaymentMethod(dialog, "Bank transfer");
  await bank.click();
  await options.getByRole("option", { name: assignments[1].name, exact: true }).click();
  await create.click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await submitted()).rows).toEqual([
    { bankAssignmentId: assignments[1].id, category: "Secondary test category" },
  ]);

  await page.setViewportSize({ width: 360, height: 640 });
  await page.getByRole("button", { name: "Edit recurring expense: Recurring bank selection", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit recurring expense", exact: true });
  const editBank = edit.getByRole("combobox", { name: "Payment provider", exact: true });
  await expect(edit.getByLabel("Start date", { exact: true })).toHaveValue("2099-01-01");
  await expect(edit.getByRole("combobox", { name: "Category", exact: true })).toHaveText("Secondary test category");
  await expect(editBank).toHaveText(assignments[1].name);
  await choosePaymentMethod(edit, "Cash");
  await expect(editBank).toBeDisabled();
  await expect(editBank).toHaveText("No provider");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect.poll(async () => (await submitted()).rows).toEqual([
    { bankAssignmentId: null, category: "Secondary test category" },
  ]);
});
