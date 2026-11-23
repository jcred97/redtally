import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { browserData } from "./data";

test("expense group loading shows the destination tab on direct visits and tab clicks", async ({ page }) => {
  const data = browserData();
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN!, "x-real-ip": "192.0.2.70" },
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok()).toBe(true);

  const groupPath = `/expense-groups/${data.group.publicId}`;
  const status = page.getByRole("status").filter({ hasText: "Loading expense group" });
  const skeleton = page.locator('main[aria-hidden="true"]');
  const database = new Client({ connectionString: process.env.REDTALLY_BROWSER_DATABASE_URL });
  await database.connect();

  async function expectLoading(navigate: () => Promise<unknown>, heading: string) {
    await database.query("BEGIN");
    try {
      // Pause group reads while the route streams its loading UI.
      await database.query('LOCK TABLE "Spending" IN ACCESS EXCLUSIVE MODE');
      await navigate();
      await expect(status).toBeAttached();
      await expect(skeleton.getByRole("heading", { name: heading, exact: true, includeHidden: true })).toBeVisible();
      if (heading !== "Spending trend") {
        await expect(skeleton.getByText("Spending trend", { exact: true })).toHaveCount(0);
      }
    } finally {
      await database.query("ROLLBACK");
    }
    await expect(status).toHaveCount(0);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  try {
    for (const [suffix, heading] of [
      ["/expenses", "Expenses"],
      ["/recurring", "Recurring expenses"],
      ["/categories", "Categories"],
      ["/payment-providers", "Banks"],
      ["/payment-providers?provider=pay-later", "Pay Later"],
      ["", "Spending trend"],
    ]) {
      await expectLoading(() => page.goto(`${groupPath}${suffix}`, { waitUntil: "commit" }), heading);
    }

    const tabs = page.getByRole("navigation", { name: "Expense group views" });
    await expectLoading(() => tabs.getByRole("link", { name: "Expenses", exact: true }).click(), "Expenses");
  } finally {
    await database.end();
  }
});
