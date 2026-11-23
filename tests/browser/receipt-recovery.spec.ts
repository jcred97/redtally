import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { browserData } from "./data";

const data = browserData();

test("receipt AI scanning recovers when a changed provider cannot be loaded", async ({ page }) => {
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN!, "x-real-ip": "192.0.2.52" },
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok()).toBe(true);

  const db = new Pool({ connectionString: process.env.REDTALLY_BROWSER_DATABASE_URL, ssl: false, max: 1 });
  const failRefresh = Promise.withResolvers<void>();
  const uploadProviders: string[] = [];
  const groupPath = `/expense-groups/${data.group.publicId}/expenses`;
  try {
    await db.query('INSERT INTO "ReceiptScanner" ("userId", provider, "encryptedKey", "keySuffix") VALUES ($1, $2, $3, $4)',
      [data.userId, "openai", "fixture-only", "1234"]);
    await page.route("**/api/receipt-scan", async (route) => {
      const provider = route.request().headers()["x-receipt-provider"];
      uploadProviders.push(provider);
      if (provider === "openai") {
        await db.query('UPDATE "ReceiptScanner" SET provider = $2 WHERE "userId" = $1', [data.userId, "anthropic"]);
        await route.fulfill({ status: 409, json: { error: "Your receipt scanning connection changed. Confirm the provider before scanning again." } });
      } else {
        await route.fulfill({ json: { suggestions: { amount: "42.50" } } });
      }
    });

    await page.goto(`${groupPath}?allMonths=1`);
    await page.getByRole("button", { name: "+ New Expense", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
    const title = dialog.getByLabel("Title", { exact: true });
    await title.fill("Receipt draft");
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 160;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "black";
      context.font = "24px Arial";
      context.fillText("TOTAL PHP 42.50", 20, 40);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await dialog.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({
      name: "receipt.png", mimeType: "image/png", buffer: Buffer.from(image, "base64"),
    });
    const oldScan = dialog.getByRole("button", { name: "Scan with OpenAI", exact: true });
    await expect(oldScan).toBeVisible();

    // The first action after the rejected upload is the automatic settings refresh.
    let refreshFailed = false;
    await page.route((url) => url.pathname === groupPath, async (route) => {
      if (!refreshFailed && route.request().headers()["next-action"]) {
        refreshFailed = true;
        await failRefresh.promise;
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    await oldScan.click();
    await expect(dialog.getByText("Loading AI scanning options…")).toBeVisible();
    await expect(oldScan).toHaveCount(0);
    failRefresh.resolve();
    await expect(dialog.getByRole("alert").filter({ hasText: "Could not load receipt scanning settings" })).toBeVisible();
    await expect(oldScan).toHaveCount(0);
    await dialog.getByRole("button", { name: "Retry loading AI scanning", exact: true }).click();

    const newScan = dialog.getByRole("button", { name: "Scan with Anthropic", exact: true });
    await expect(newScan).toBeVisible();
    await expect(dialog.getByText(/Scanning sends this receipt image to Anthropic/)).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Receipt image preview" })).toBeVisible();
    await expect(title).toHaveValue("Receipt draft");
    expect(uploadProviders).toEqual(["openai"]);
    await newScan.click();
    await expect(dialog.getByText("Suggestions from Anthropic")).toBeVisible();
    await dialog.getByRole("button", { name: "Use amount", exact: true }).click();
    await expect(dialog.getByLabel("Amount (PHP)", { exact: true })).toHaveValue("42.50");
    expect(uploadProviders).toEqual(["openai", "anthropic"]);
  } finally {
    failRefresh.resolve();
    try {
      await db.query('DELETE FROM "ReceiptScanner" WHERE "userId" = $1', [data.userId]);
    } finally {
      await db.end();
    }
  }
});
