import { expect, test, type Locator, type Page } from "@playwright/test";
import { browserData } from "./data";

const threeMonthPurchase = "Three-month Shopee purchase";
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
    period: "Jun 25, 2026 to Jul 24, 2026",
    dueDate: "Aug 5, 2026",
    total: "₱333.34",
    installments: [{ title: threeMonthPurchase, number: "1 of 3", amount: "₱333.34" }],
  },
  {
    period: "Jul 25, 2026 to Aug 24, 2026",
    dueDate: "Sep 5, 2026",
    total: "₱333.33",
    installments: [{ title: threeMonthPurchase, number: "2 of 3", amount: "₱333.33" }],
  },
  {
    period: "Aug 25, 2026 to Sep 24, 2026",
    dueDate: "Oct 5, 2026",
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

async function savePurchase(
  page: Page,
  tabs: Locator,
  { title, amount, dueDay, term }: { title: string; amount: string; dueDay: string; term: string },
) {
  await page.getByRole("button", { name: "+ New Expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill(amount);
  await dialog.getByLabel("Date", { exact: true }).fill("2026-06-26");
  for (const [label, option] of [
    ["Category", "Shopping"],
    ["Payment Method", "Pay Later"],
    ["Payment Provider", "SPayLater"],
    ["Monthly due day", dueDay],
    ["Payment term", term],
  ]) {
    await dialog.getByRole("combobox", { name: label, exact: true }).click();
    await dialog.getByRole("option", { name: option, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog).toBeHidden();
  await tabs.getByRole("link", { name: "Billing", exact: true }).click();
}

async function expectCycle(billing: Locator, heading: string, expected: ExpectedBill[]) {
  const cycle = billing.getByRole("region", { name: heading, exact: true });
  await expect(cycle.getByRole("heading", { level: 4 })).toHaveText(expected.map(({ period }) => period));
  for (const { period, dueDate, total, installments } of expected) {
    const bill = cycle.getByRole("article", { name: period, exact: true });
    await expect(bill.getByText(`Due ${dueDate}`, { exact: true })).toBeVisible();
    await expect(bill.getByText("Estimated principal total", { exact: true })).toBeVisible();
    await expect(bill.locator("dd")).toHaveText(total);
    await expect(bill.getByRole("listitem")).toHaveCount(installments.length);
    for (const { title, number, amount } of installments) {
      const line = bill.getByRole("listitem").filter({ hasText: title });
      await expect(line.getByText(title, { exact: true })).toBeVisible();
      await expect(line.getByText(`Installment ${number}`, { exact: true })).toBeVisible();
      await expect(line.getByText(amount, { exact: true })).toBeVisible();
    }
  }
}

test("SPayLater purchases create and reuse billing periods without duplicating expenses", async ({ page, baseURL }) => {
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
  await expect(billing.getByText("No bills yet", { exact: true })).toBeVisible();
  await expect(billing.getByRole("article")).toHaveCount(0);
  expect(await billing.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await billing.getByRole("link", { name: "Go to Expenses", exact: true }).click();
  await expect(page).toHaveURL(`${groupPath}/expenses`);
  await page.setViewportSize({ width: 1280, height: 820 });

  await savePurchase(page, tabs, { title: threeMonthPurchase, amount: "1000", dueDay: "5th", term: "3 months" });
  await expectCycle(billing, "Due on the 5th", firstThreeBills);
  await expect(billing.getByRole("article")).toHaveCount(3);

  await tabs.getByRole("link", { name: "Expenses", exact: true }).click();
  await savePurchase(page, tabs, {
    title: sameCyclePurchase, amount: "100", dueDay: "5th", term: "Pay in full on first bill",
  });
  await expectCycle(billing, "Due on the 5th", fifthCycleAfterReuse);
  await expect(billing.getByRole("article")).toHaveCount(3);

  await tabs.getByRole("link", { name: "Expenses", exact: true }).click();
  await savePurchase(page, tabs, {
    title: otherCyclePurchase, amount: "60", dueDay: "15th", term: "Pay in full on first bill",
  });
  await expect(billing.getByRole("heading", { level: 3 })).toHaveText(["Due on the 5th", "Due on the 15th"]);
  await expectCycle(billing, "Due on the 5th", fifthCycleAfterReuse);
  await expectCycle(billing, "Due on the 15th", [{
    period: "Jun 5, 2026 to Jul 4, 2026",
    dueDate: "Jul 15, 2026",
    total: "₱60.00",
    installments: [{ title: otherCyclePurchase, number: "1 of 1", amount: "₱60.00" }],
  }]);
  await expect(billing.getByRole("article")).toHaveCount(4);

  await page.goto(`${groupPath}/expenses?allMonths=1`);
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
