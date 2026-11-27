import { expect, test, type Locator, type Page } from "@playwright/test";
import { browserData } from "./data";

const scheduleYear = new Date().getUTCFullYear() + 1;
const threeMonthPurchase = "Three-month Shopee purchase " + "LongItemReference".repeat(4);
const sameCyclePurchase = "Same-cycle Shopee purchase";
const otherCyclePurchase = "Other-cycle Shopee purchase";

type ExpectedBill = {
  period: string;
  dueDate: string;
  total: string;
  installments: { title: string; number: string; amount: string }[];
};

const firstThreeBills: ExpectedBill[] = [
  {
    period: `Jun 25, ${scheduleYear} to Jul 24, ${scheduleYear}`,
    dueDate: `Aug 5, ${scheduleYear}`,
    total: "₱333.34",
    installments: [{ title: threeMonthPurchase, number: "1 of 3", amount: "₱333.34" }],
  },
  {
    period: `Jul 25, ${scheduleYear} to Aug 24, ${scheduleYear}`,
    dueDate: `Sep 5, ${scheduleYear}`,
    total: "₱333.33",
    installments: [{ title: threeMonthPurchase, number: "2 of 3", amount: "₱333.33" }],
  },
  {
    period: `Aug 25, ${scheduleYear} to Sep 24, ${scheduleYear}`,
    dueDate: `Oct 5, ${scheduleYear}`,
    total: "₱333.33",
    installments: [{ title: threeMonthPurchase, number: "3 of 3", amount: "₱333.33" }],
  },
];

const fifthCycleAfterReuse: ExpectedBill[] = [
  {
    ...firstThreeBills[0],
    total: "₱433.34",
    installments: [
      ...firstThreeBills[0].installments,
      { title: sameCyclePurchase, number: "1 of 1", amount: "₱100.00" },
    ],
  },
  ...firstThreeBills.slice(1),
];

async function chooseOption(dialog: Locator, label: string, option: string) {
  await dialog.getByRole("combobox", { name: label, exact: true }).click();
  await dialog.getByRole("option", { name: option, exact: true }).click();
}

async function editExpense(page: Page, title: string) {
  await page.getByRole("button", { name: `Actions for ${title}`, exact: true }).click();
  await page.getByRole("button", { name: `Edit expense: ${title}`, exact: true }).click();
  return page.getByRole("dialog", { name: "Edit Expense", exact: true });
}

async function savePurchase(
  page: Page,
  tabs: Locator,
  { title, amount, dueDay, term }: { title: string; amount: string; dueDay: string; term: string },
) {
  await page.getByRole("button", { name: "+ New Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill(amount);
  await dialog.getByLabel("Date", { exact: true }).fill(`${scheduleYear}-06-26`);
  for (const [label, option] of [
    ["Category", "Shopping"],
    ["Payment Method", "Pay Later"],
    ["Payment Provider", "SPayLater"],
    ["Monthly due day", dueDay],
    ["Payment term", term],
  ]) {
    await chooseOption(dialog, label, option);
  }
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog).toBeHidden();
  await tabs.getByRole("link", { name: "Billing", exact: true }).click();
}

async function expectSchedule(section: Locator, expected: ExpectedBill[], nearestOpen: boolean) {
  await expect(section.getByRole("heading", { level: 4 })).toHaveText(expected.map(({ dueDate }) => `Due ${dueDate}`));
  for (const [index, { period, dueDate, total, installments }] of expected.entries()) {
    const bill = section.getByRole("article", { name: `Due ${dueDate}`, exact: true });
    await expect(bill.getByText(period, { exact: false })).toBeVisible();
    await expect(bill.locator("header").getByText(total)).toBeVisible();
    const defaultOpen = nearestOpen && index === 0;
    const disclosure = bill.locator("summary");
    const count = `installments (${installments.length})`;
    await expect(disclosure).toHaveAccessibleName(`${defaultOpen ? "Hide" : "Show"} ${count}`);
    if (!defaultOpen) {
      await expect(bill.getByRole("list")).toBeHidden();
      await disclosure.press("Enter");
    }
    await expect(disclosure).toHaveAccessibleName(`Hide ${count}`);
    await expect(bill.getByRole("listitem")).toHaveCount(installments.length);
    for (const { title, number, amount } of installments) {
      const line = bill.getByRole("listitem").filter({ hasText: title });
      await expect(line.getByText(title, { exact: true })).toBeVisible();
      await expect(line.getByText(`Installment ${number}`, { exact: true })).toBeVisible();
      await expect(line.getByText(amount, { exact: true })).toBeVisible();
    }
    expect(await bill.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (!defaultOpen) {
      await disclosure.press("Space");
      await expect(disclosure).toHaveAccessibleName(`Show ${count}`);
      await expect(bill.getByRole("list")).toBeHidden();
    }
  }
}

test("creating and editing SPayLater purchases generates bills without duplicating expenses", async ({ page, baseURL }) => {
  const data = browserData();
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: baseURL!, "x-real-ip": "192.0.2.74" },
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok()).toBe(true);

  const groupPath = `/expense-groups/${data.spayLater.publicId}`;
  await page.setViewportSize({ width: 360, height: 820 });
  await page.goto(`${groupPath}/billing`);
  const tabs = page.getByRole("navigation", { name: "Expense group views", exact: true });
  const billing = page.getByRole("region", { name: "Billing", exact: true });
  const upcoming = billing.getByRole("region", { name: "Upcoming bills", exact: true });
  const past = billing.getByRole("region", { name: "Past scheduled bills", exact: true });
  await expect(billing.getByText("No bills yet", { exact: true })).toBeVisible();
  await expect(billing.getByRole("article")).toHaveCount(0);
  expect(await billing.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await billing.getByRole("link", { name: "Go to Expenses", exact: true }).click();
  await expect(page).toHaveURL(`${groupPath}/expenses`);
  await page.setViewportSize({ width: 1280, height: 820 });

  await savePurchase(page, tabs, { title: threeMonthPurchase, amount: "1000", dueDay: "5th", term: "3 months" });
  await expectSchedule(upcoming, firstThreeBills, true);
  await expect(billing.getByRole("article")).toHaveCount(3);

  const historyPath = `${groupPath}/expenses?allMonths=1`;
  const billingTab = tabs.getByRole("link", { name: "Billing", exact: true });
  await page.goto(historyPath);
  const converted = await editExpense(page, sameCyclePurchase);
  await chooseOption(converted, "Payment Method", "Pay Later");
  await chooseOption(converted, "Payment Provider", "SPayLater");
  await chooseOption(converted, "Monthly due day", "5th");
  await chooseOption(converted, "Payment term", "Pay in full on first bill");
  await converted.getByLabel(/Order completed on/).fill(`${scheduleYear}-06-27`);
  await converted.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(converted).toBeHidden();
  await billingTab.click();
  await expectSchedule(upcoming, fifthCycleAfterReuse, true);
  await expect(billing.getByRole("article")).toHaveCount(3);

  await page.goto(historyPath);
  const reopened = await editExpense(page, sameCyclePurchase);
  await expect(reopened.getByRole("combobox", { name: "Monthly due day", exact: true })).toHaveText("5th");
  await expect(reopened.getByRole("combobox", { name: "Payment term", exact: true })).toHaveText("Pay in full on first bill");
  await expect(reopened.getByLabel(/Order completed on/)).toHaveValue(`${scheduleYear}-06-27`);
  await reopened.getByRole("button", { name: "Cancel", exact: true }).click();

  const unscheduled = await editExpense(page, otherCyclePurchase);
  await expect(unscheduled.getByRole("combobox", { name: "Payment Provider", exact: true })).toHaveText("SPayLater");
  await expect(unscheduled.getByRole("combobox", { name: "Monthly due day", exact: true })).toHaveText("Select a due day");
  await chooseOption(unscheduled, "Monthly due day", "15th");
  await chooseOption(unscheduled, "Payment term", "Pay in full on first bill");
  await unscheduled.getByLabel(/Order completed on/).fill(`${scheduleYear}-06-26`);
  await unscheduled.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(unscheduled).toBeHidden();
  await billingTab.click();
  await page.setViewportSize({ width: 360, height: 820 });
  const otherCycleBill = {
    period: `Jun 5, ${scheduleYear} to Jul 4, ${scheduleYear}`,
    dueDate: `Jul 15, ${scheduleYear}`,
    total: "₱60.00",
    installments: [{ title: otherCyclePurchase, number: "1 of 1", amount: "₱60.00" }],
  };
  await expectSchedule(upcoming, [otherCycleBill, ...fifthCycleAfterReuse], true);
  await expect(billing.getByText("Purchase amount only, before interest and fees.", { exact: true })).toBeVisible();
  await expect(billing.getByRole("article")).toHaveCount(4);
  expect(await billing.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(historyPath);
  const earlierPurchase = await editExpense(page, otherCyclePurchase);
  const pastYear = scheduleYear - 2;
  await earlierPurchase.getByLabel("Date", { exact: true }).fill(`${pastYear}-06-26`);
  await earlierPurchase.getByLabel(/Order completed on/).fill(`${pastYear}-06-26`);
  await earlierPurchase.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(earlierPurchase).toBeHidden();
  await billingTab.click();
  await expect(billing.getByRole("heading", { level: 3 })).toHaveText(["Upcoming bills", "Past scheduled bills"]);
  await expectSchedule(upcoming, fifthCycleAfterReuse, true);
  await expectSchedule(past, [{
    ...otherCycleBill,
    period: `Jun 5, ${pastYear} to Jul 4, ${pastYear}`,
    dueDate: `Jul 15, ${pastYear}`,
  }], false);

  await page.goto(historyPath);
  await expect(page.getByText("3 matching expenses · ₱1,160.00 total", { exact: true })).toBeVisible();
  const history = page.getByRole("table", { name: "Expense history", exact: true });
  await expect(history.locator("tbody").getByRole("row")).toHaveCount(3);
  for (const [title, fullAmount] of [
    [threeMonthPurchase, "₱1,000.00"],
    [sameCyclePurchase, "₱100.00"],
    [otherCyclePurchase, "₱60.00"],
  ]) {
    const row = history.getByRole("row").filter({ has: page.getByRole("cell", { name: title, exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell", { name: fullAmount, exact: true })).toBeVisible();
  }
});
