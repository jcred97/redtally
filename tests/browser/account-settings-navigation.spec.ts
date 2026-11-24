import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { browserData } from "./data";

test.beforeEach(async ({ page }) => {
  const data = browserData();
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN!, "x-real-ip": "192.0.2.77" },
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok()).toBe(true);
});

test("account settings switches sections without requesting the page again or fading the main header", async ({ page }) => {
  const profileUrl = "/account-settings";
  const scanningUrl = "/account-settings?section=receipt-scanning";
  const settingsPage = (url: URL) => url.pathname === profileUrl;
  let initialRequestAllowed = false;
  const extraRequests: string[] = [];
  await page.route(settingsPage, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.continue();
    if (!initialRequestAllowed && request.isNavigationRequest()) {
      initialRequestAllowed = true;
      return route.continue();
    }
    extraRequests.push(request.url());
    return route.abort();
  });

  await page.goto(profileUrl);
  const navigation = page.getByRole("navigation", { name: "Account settings sections" });
  const profile = navigation.getByRole("link", { name: "Profile", exact: true });
  const scanning = navigation.getByRole("link", { name: "Receipt scanning", exact: true });
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Profile");

  const header = page.getByRole("banner");
  const originalHeaderPosition = await header.boundingBox();
  await header.evaluate((banner) => {
    const startViewTransition = document.startViewTransition.bind(document);
    function recordHeaderFade() {
      for (let element: Element | null = banner; element; element = element.parentElement) {
        const classes = getComputedStyle(element).getPropertyValue("view-transition-class");
        if (classes.split(/\s+/).includes("page-fade")) banner.setAttribute("data-page-fade-observed", "true");
      }
    }
    document.startViewTransition = (update) => {
      recordHeaderFade();
      const transition = startViewTransition(update);
      void transition.ready.then(recordHeaderFade, () => undefined);
      return transition;
    };
  });

  await scanning.click();
  await expect(page).toHaveURL(scanningUrl);
  await expect(heading).toHaveText("Receipt scanning");
  await expect(scanning).toHaveAttribute("aria-current", "page");

  await profile.click();
  await expect(page).toHaveURL(profileUrl);
  await expect(heading).toHaveText("Profile");
  await expect(profile).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(scanningUrl);
  await expect(heading).toHaveText("Receipt scanning");
  await page.goForward();
  await expect(page).toHaveURL(profileUrl);
  await expect(heading).toHaveText("Profile");
  expect(extraRequests).toEqual([]);
  await expect(header).not.toHaveAttribute("data-page-fade-observed", "true");
  expect(await header.boundingBox()).toEqual(originalHeaderPosition);

  await page.unroute(settingsPage);
  await page.goto(scanningUrl);
  await expect(heading).toHaveText("Receipt scanning");
  await page.reload();
  await expect(heading).toHaveText("Receipt scanning");
  await expect(scanning).toHaveAttribute("aria-current", "page");
});

test("receipt scanning stays disconnected after switching settings sections", async ({ page }) => {
  const data = browserData();
  const database = new Client({ connectionString: process.env.REDTALLY_BROWSER_DATABASE_URL });
  await database.connect();
  try {
    await database.query(
      'INSERT INTO "ReceiptScanner" ("userId", provider, "encryptedKey", "keySuffix") VALUES ($1, $2, $3, $4)',
      [data.userId, "openai", "fixture-only", "1234"],
    );
    await page.goto("/account-settings?section=receipt-scanning");
    const panel = page.getByRole("region", { name: "Receipt scanning", exact: true });
    await expect(panel.getByText("OpenAI", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(panel.getByRole("combobox", { name: "Provider", exact: true })).toBeVisible();

    const navigation = page.getByRole("navigation", { name: "Account settings sections" });
    await navigation.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await navigation.getByRole("link", { name: "Receipt scanning", exact: true }).click();
    await expect(panel.getByRole("combobox", { name: "Provider", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Disconnect", exact: true })).toHaveCount(0);
  } finally {
    try {
      await database.query('DELETE FROM "ReceiptScanner" WHERE "userId" = $1', [data.userId]);
    } finally {
      await database.end();
    }
  }
});
