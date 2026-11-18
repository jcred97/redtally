import { expect, test, type Page } from "@playwright/test";
import { browserData } from "./data";

const data = browserData();
const sessionEndpoint = "**/api/auth/get-session";

async function signInOwner(page: Page) {
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN!, "x-real-ip": "192.0.2.51" },
    data: { email: data.email, password: data.password },
  });
  expect(response.ok()).toBe(true);
}

test("an open dashboard survives a failed session check and clears after sign-out in another tab", async ({ context, page }) => {
  await signInOwner(page);
  await page.route(sessionEndpoint, (route) => route.fulfill({ status: 503 }), { times: 1 });
  const failedCheck = page.waitForResponse((response) => response.url().endsWith("/api/auth/get-session") && response.status() === 503);
  await page.goto("/");
  await failedCheck;
  const ownerGroup = page.getByRole("link", { name: /Browser daily expenses/ });
  await expect(ownerGroup).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByText(data.email, { exact: true })).toBeVisible();

  const accountTab = await context.newPage();
  await accountTab.goto("/");
  await accountTab.getByRole("button", { name: "Account menu" }).click();
  await accountTab.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(ownerGroup).toHaveCount(0);
});

test("an open dashboard switches to the current account when the session is rechecked", async ({ context, page }) => {
  const signupTab = await context.newPage();
  await signupTab.goto("/sign-up");
  await signInOwner(page);
  await page.clock.install();
  const firstCheck = page.waitForResponse((response) => response.url().endsWith("/api/auth/get-session") && response.ok());
  await page.goto("/");
  await firstCheck;
  const ownerGroup = page.getByRole("link", { name: /Browser daily expenses/ });
  await expect(ownerGroup).toBeVisible();

  const email = "session-change@example.test";
  await signupTab.getByLabel("Name", { exact: true }).fill("Session Change");
  await signupTab.getByLabel("Email", { exact: true }).fill(email);
  await signupTab.getByLabel("Password", { exact: true }).fill(data.password);
  await signupTab.getByLabel("Confirm password", { exact: true }).fill(data.password);
  await signupTab.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(signupTab.getByText("No expense groups yet", { exact: true })).toBeVisible();

  await page.clock.fastForward("05:01");
  await expect(page.getByText("No expense groups yet", { exact: true })).toBeVisible();
  await expect(ownerGroup).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});
