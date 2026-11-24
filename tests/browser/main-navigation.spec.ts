import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { browserData } from "./data";

test("main navigation prefetches the destination and keeps the current page during a slow switch", async ({ page }) => {
  const data = browserData();
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN!, "x-real-ip": "192.0.2.73" },
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok()).toBe(true);

  const database = new Client({ connectionString: process.env.REDTALLY_BROWSER_DATABASE_URL });
  await database.connect();
  try {
    for (const { width, from, to, link, current, destinationTitle } of [
      { width: 1280, from: "/", to: "/expense-groups", link: "Expense Groups", current: "Overview", destinationTitle: "All Expense Groups" },
      { width: 360, from: "/expense-groups", to: "/", link: "Overview", current: "All Expense Groups", destinationTitle: "Overview" },
    ]) {
      await page.setViewportSize({ width, height: 850 });
      const matchesDestination = (url: URL) => url.pathname === to && url.searchParams.has("_rsc");
      let prefetchStarted = false;
      const resumeRequest = Promise.withResolvers<void>();
      await page.route(matchesDestination, async (route) => {
        prefetchStarted = true;
        await resumeRequest.promise;
        await route.continue();
      });

      try {
        await page.goto(from);
        const currentTitle = page.getByRole("heading", { name: current });
        await expect(currentTitle).toBeVisible();
        if (width < 640) await page.getByRole("button", { name: "Open navigation" }).click();
        await expect.poll(() => prefetchStarted).toBe(true);

        await database.query("BEGIN");
        try {
          await database.query('LOCK TABLE "Spending" IN ACCESS EXCLUSIVE MODE');
          resumeRequest.resolve();
          const navigation = page.getByRole("navigation", { name: "Main navigation" });
          await navigation.getByRole("link", { name: link, exact: true }).click();
          await expect.poll(async () => {
            const result = await database.query<{ waiting: boolean }>(
              "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE $1) AS waiting",
              ['%"Spending"%'],
            );
            return result.rows[0].waiting;
          }).toBe(true);
          await expect(currentTitle).toBeVisible();
          await expect(page.getByRole("status").filter({ hasText: /Loading overview|Loading your expense groups/ })).toHaveCount(0);
        } finally {
          await database.query("ROLLBACK");
        }

        await expect(page).toHaveURL(to);
        await expect(page.getByRole("heading", { name: destinationTitle })).toBeVisible();
      } finally {
        resumeRequest.resolve();
        await page.unroute(matchesDestination);
      }
    }
  } finally {
    await database.end();
  }
});
