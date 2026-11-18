import { expect, test } from "@playwright/test";
import { browserData } from "./data";

const data = browserData();

test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/auth/sign-in/email", {
    // Give these local fixtures their own rate-limit bucket, as a proxy would for a separate client.
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN!, "x-real-ip": "192.0.2.10" },
    data: { email: data.email, password: data.password },
  });
  expect(response.ok()).toBe(true);
  await page.goto(`/spending/${data.group.publicId}?allMonths=1`);
});

test("settings menu supports keyboard navigation and restores focus after a dialog", async ({ page }) => {
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const editName = page.getByRole("button", { name: "Edit Name", exact: true });
  const currency = page.getByRole("button", { name: "Change Currency", exact: true });
  const duplicate = page.getByRole("button", { name: "Duplicate Expense Group", exact: true });
  const remove = page.getByRole("button", { name: "Delete Expense Group", exact: true });

  await settings.press("ArrowDown");
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(editName).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(currency).toBeFocused();
  await page.keyboard.press("d");
  await expect(duplicate).toBeFocused();
  await page.keyboard.press("End");
  await expect(remove).toBeFocused();
  await page.keyboard.press("Home");
  await expect(editName).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await expect(settings).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(editName).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Edit expense group name" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(settings).toBeFocused();
});

test("account menu supports arrows, Escape, and Tab without activating sign-out", async ({ page }) => {
  const account = page.getByRole("button", { name: "Account menu", exact: true });
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });

  await account.press("ArrowUp");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await expect(account).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Enter");
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await expect(signOut).not.toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/spending/${data.group.publicId}`);
});

test("expense group switcher preserves keyboard navigation and isolates its dialog", async ({ page }) => {
  const switcher = page.getByRole("button", { name: /Browser daily expenses, switch expense group/ });
  const navigation = page.getByRole("navigation", { name: "Switch expense group" });
  const allGroups = navigation.getByRole("link", { name: /All expense groups/ });
  const current = navigation.getByRole("link", { name: "Browser daily expenses", exact: true });
  const merchantGroup = navigation.getByRole("link", { name: "Browser merchant search", exact: true });
  const create = page.getByRole("button", { name: "Create new expense group", exact: true });

  await switcher.press("ArrowDown");
  await expect(allGroups).toBeFocused();
  await expect(current).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("End");
  await expect(create).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New Expense Group" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(create).toBeFocused();
  await expect(switcher).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(switcher).toBeFocused();
  await expect(switcher).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("ArrowDown");
  await expect(allGroups).toBeFocused();
  await merchantGroup.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/spending/${data.merchants.publicId}`);
});
