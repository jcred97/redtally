import { expect, test } from "@playwright/test";
import { formatExpenseDate, getManilaToday, parseExpenseDate } from "../../app/lib/expenses/date";
import { browserData } from "./data";

const data = browserData();

test("records a cash loan repayment within disbursement and Manila date bounds", async ({ page }) => {
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN! },
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok()).toBe(true);
  await page.goto("/loans");
  await page.getByRole("link", { name: "Add Loan", exact: true }).click();

  const title = "Browser cash loan date bounds";
  const disbursement = "2020-04-04";
  await page.getByLabel("Loan name", { exact: true }).fill(title);
  await page.getByLabel("Lender", { exact: true }).fill("Browser Bank");
  await page.getByLabel("Amount borrowed (₱)", { exact: true }).fill("100");
  await page.getByLabel("Disbursement date", { exact: true }).fill(disbursement);
  await page.getByLabel("Receiving account or wallet", { exact: true }).fill("Browser Wallet");
  await page.getByLabel("Due date 1", { exact: true }).fill("2020-05-04");
  await page.getByRole("button", { name: "Add Loan", exact: true }).click();
  await expect(page).toHaveURL(/\/loans\/cash\//);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Record Payment", exact: true }).click();
  const form = page.getByRole("region", { name: "Record Payment", exact: true });
  const date = form.getByLabel("Payment date", { exact: true });
  const today = getManilaToday();
  await expect(date).toHaveAttribute("min", disbursement);
  await expect(date).toHaveAttribute("max", today);
  await expect(date).toHaveValue(today);
  await date.fill("2020-04-03");
  expect(await date.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);

  const tomorrow = parseExpenseDate(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await date.fill(tomorrow.toISOString().slice(0, 10));
  expect(await date.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);

  await date.fill(disbursement);
  await form.getByLabel("Paid from", { exact: true }).fill("Browser Wallet");
  await form.getByLabel(`${title} applied amount`, { exact: true }).fill("25");
  await form.getByRole("button", { name: "Record Payment", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Payment recorded.");
  await page.reload();
  const payment = page.getByRole("row").filter({ hasText: "Browser Wallet" });
  await expect(payment).toContainText(formatExpenseDate(disbursement));
  await expect(payment).toContainText("₱25.00");
  await expect(page.getByRole("cell", { name: "₱75.00", exact: true })).toBeVisible();
});
