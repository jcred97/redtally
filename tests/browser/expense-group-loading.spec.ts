import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { browserData } from "./data";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-features=OverlayScrollbar"] } });

test("expense group loading shows the destination tab at a consistent width", async ({ page }) => {
  const data = browserData();
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin: process.env.REDTALLY_BROWSER_ORIGIN!, "x-real-ip": "192.0.2.70" },
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok()).toBe(true);

  const groupPath = `/expense-groups/${data.dashboard.unbudgeted}`;
  const status = page.getByRole("status").filter({ hasText: "Loading expense group" });
  const skeleton = page.locator('main[aria-hidden="true"]');
  const database = new Client({ connectionString: process.env.REDTALLY_BROWSER_DATABASE_URL });
  await database.connect();

  let tabFrame: { x: number; width: number } | undefined;
  let scrollStates = new Set<boolean>();

  async function expectFrame(main: typeof skeleton, heading: string) {
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      { message: `${heading} stays within the viewport after the page transition` },
    ).toBeLessThanOrEqual(0);
    const box = (await main.boundingBox())!;
    const viewport = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        layoutWidth: document.body.getBoundingClientRect().width,
        scrolls: root.scrollHeight > root.clientHeight,
        gutter: getComputedStyle(root).scrollbarGutter,
      };
    });
    expect(viewport.gutter).toBe("stable");
    scrollStates.add(viewport.scrolls);
    const padding = page.viewportSize()!.width >= 640 ? 24 : 16;
    expect(box.width, `${heading} keeps the group's max width and side padding`)
      .toBe(Math.min(1280, viewport.layoutWidth) - padding * 2);
    const frame = { x: box.x, width: box.width };
    tabFrame ??= frame;
    expect(frame, `${heading} uses the same frame as the other tabs`).toEqual(tabFrame);
    return box;
  }

  async function expectFirstRowWidth(heading: string, locator: typeof skeleton, mainWidth: number) {
    if (!["Recurring expenses", "Categories", "Banks", "Pay Later"].includes(heading)) return;
    const width = await locator.evaluate((element) => {
      const cards = element.closest("section")?.querySelectorAll(":scope > ul > li");
      if (!cards?.length) return 0;
      const first = cards[0].getBoundingClientRect();
      const row = Array.from(cards, (card) => card.getBoundingClientRect()).filter((card) => card.top === first.top);
      return Math.max(...row.map((card) => card.right)) - first.left;
    });
    expect(Math.abs(width - mainWidth), `${heading} cards fill the first row`).toBeLessThanOrEqual(1);
  }

  async function expectLoading(navigate: () => Promise<unknown>, heading: string) {
    const loadingHeading = skeleton.getByRole("heading", { name: heading, exact: true, includeHidden: true });
    let before: { top: number; headingX: number; headingY: number };
    await database.query("BEGIN");
    try {
      // Pause group reads while the route streams its loading UI.
      await database.query('LOCK TABLE "Spending" IN ACCESS EXCLUSIVE MODE');
      await navigate();
      await expect(status).toBeAttached();
      await expect(loadingHeading).toBeVisible();
      if (heading !== "Spending trend") {
        await expect(skeleton.getByText("Spending trend", { exact: true })).toHaveCount(0);
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const mainBox = await expectFrame(skeleton, `${heading} skeleton`);
      const headingBox = (await loadingHeading.boundingBox())!;
      before = { top: mainBox.y, headingX: headingBox.x, headingY: headingBox.y };
      await expectFirstRowWidth(heading, loadingHeading, mainBox.width);
    } finally {
      await database.query("ROLLBACK");
    }
    await expect(status).toHaveCount(0);
    const loadedHeading = page.getByRole("heading", { name: heading, exact: true });
    await expect(loadedHeading).toBeVisible();
    const mainBox = await expectFrame(page.getByRole("main"), heading);
    await expectFirstRowWidth(heading, loadedHeading, mainBox.width);
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const extraTitleHeight = Math.max(0, title.height - 40);
    expect(Math.abs(mainBox.y - before.top - extraTitleHeight), `${heading} content accounts for a wrapped group name`)
      .toBeLessThanOrEqual(1);
    if (heading !== "Spending trend") {
      const headingBox = (await loadedHeading.boundingBox())!;
      expect(Math.abs(headingBox.x - before.headingX), `${heading} heading horizontal alignment`).toBeLessThanOrEqual(1);
      expect(Math.abs(headingBox.y - mainBox.y - (before.headingY - before.top)), `${heading} heading vertical alignment`)
        .toBeLessThanOrEqual(1);
    }
  }

  try {
    for (const width of [1440, 1100, 360]) {
      await page.setViewportSize({ width, height: 540 });
      tabFrame = undefined;
      scrollStates = new Set();
      if (width === 1100) {
        await expectLoading(() => page.goto(`/expense-groups/${data.group.publicId}/categories`, { waitUntil: "commit" }), "Categories");
      }
      for (const [suffix, heading] of [
        ["/expenses", "Expenses"],
        ["/expenses?allMonths=1&view=grouped", "Expenses"],
        ["/recurring", "Recurring expenses"],
        ["/categories", "Categories"],
        ["/payment-providers", "Banks"],
        ["/payment-providers?provider=pay-later", "Pay Later"],
        ["", "Spending trend"],
      ]) {
        await expectLoading(() => page.goto(`${groupPath}${suffix}`, { waitUntil: "commit" }), heading);
      }
      if (width >= 1100) {
        expect(scrollStates, `checked short and long tabs at ${width}px`).toEqual(new Set([true, false]));
      }
    }

    const tabs = page.getByRole("navigation", { name: "Expense group views" });
    await expectLoading(() => tabs.getByRole("link", { name: "Expenses", exact: true }).click(), "Expenses");
  } finally {
    await database.end();
  }
});
