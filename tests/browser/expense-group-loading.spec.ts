import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { browserData } from "./data";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-features=OverlayScrollbar"] } });

test("signed-in pages and their skeletons share a consistent width", async ({ page }) => {
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
    const insets = await main.evaluate((element) => {
      const style = getComputedStyle(element);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
    });
    const frame = { x: box.x + insets.left, width: box.width - insets.left - insets.right };
    expect(frame.width, `${heading} keeps the dashboard max width and side padding`)
      .toBe(Math.min(1280, viewport.layoutWidth) - padding * 2);
    const header = (await page.getByRole("banner").first().locator(":scope > div").boundingBox())!;
    expect(frame, `${heading} aligns with the header`)
      .toEqual({ x: header.x + padding, width: header.width - padding * 2 });
    tabFrame ??= frame;
    expect(frame, `${heading} uses the same frame as the other tabs`).toEqual(tabFrame);
    return box;
  }

  async function whileGroupReadsAreBlocked<T>(check: () => Promise<T>) {
    await database.query("BEGIN");
    try {
      // Pause group reads while the route streams its loading UI.
      await database.query('LOCK TABLE "Spending" IN ACCESS EXCLUSIVE MODE');
      return await check();
    } finally {
      await database.query("ROLLBACK");
    }
  }

  async function getAnchor(locator: typeof skeleton) {
    await expect(locator).toBeVisible();
    const { x, y } = (await locator.boundingBox())!;
    return { x, y };
  }

  async function expectTopLevelFrame(path: string, heading: string, loadingMessage: string) {
    const loading = page.getByRole("status").filter({ hasText: loadingMessage });
    const main = page.getByRole("main");
    const listTitle = main.getByRole("heading", { name: "All Expense Groups", exact: true });
    const placeholder = await whileGroupReadsAreBlocked(async () => {
      await page.goto(path, { waitUntil: "commit" });
      await expect(loading).toBeAttached();
      await expectFrame(main, `${heading} skeleton`);
      return {
        summary: path === "/" ? await loading.locator(":scope > div:last-child > div").first().boundingBox() : null,
        title: path === "/expense-groups" ? await getAnchor(listTitle) : null,
      };
    });
    await expect(loading).toHaveCount(0);
    await expectFrame(main, heading);
    if (path === "/") {
      const card = main.getByRole("region", { name: "Spent this month", exact: true });
      await expect(card).toBeVisible();
      const summary = (await card.boundingBox())!;
      expect(summary.width, "the Dashboard summary placeholder matches the loaded card").toBe(placeholder.summary?.width);
    }
    if (path !== "/expense-groups") return null;

    if (page.viewportSize()!.width >= 640) {
      const createGroup = main.getByRole("button", { name: "New Expense Group", exact: true });
      await expect(createGroup.locator(":scope > span:not([aria-hidden])")).toHaveText("New Expense Group");
    }

    const switcher = await getAnchor(main.getByRole("button", { name: "All Expense Groups, switch expense group" }));
    expect(switcher, "the expense group list title stays in place while loading").toEqual(placeholder.title);
    return switcher;
  }

  async function expectSettingsFrame() {
    await page.goto("/account-settings");
    const main = page.getByRole("main");
    const settingsNav = page.getByRole("navigation", { name: "Account settings sections" });
    for (const heading of ["Profile", "Receipt scanning"]) {
      const link = settingsNav.getByRole("link", { name: heading, exact: true });
      await link.click();
      const title = main.getByRole("heading", { level: 1, name: heading, exact: true });
      const panel = main.getByRole("region", { name: heading, exact: true });
      await expect(title).toBeVisible();
      await expect(panel).toBeVisible();
      await expect(main.getByRole("heading", { name: "Account settings", exact: true })).toHaveCount(0);
      await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(settingsNav.locator('[aria-current="page"]')).toHaveCount(1);
      const mainBox = await expectFrame(main, `Account Settings ${heading}`);
      const titleBox = (await title.boundingBox())!;
      const panelBox = (await panel.boundingBox())!;
      const navBox = (await settingsNav.boundingBox())!;
      const sideBySide = page.viewportSize()!.width >= 640;
      const padding = sideBySide ? 24 : 16;
      const panelStart = sideBySide ? navBox.x + navBox.width + 24 : mainBox.x + padding;
      const availableWidth = mainBox.x + mainBox.width - padding - panelStart;
      expect(panelBox.x).toBe(panelStart);
      expect(panelBox.width).toBe(Math.min(768, availableWidth));
      expect(titleBox.x).toBe(panelBox.x);
      expect(titleBox.y + titleBox.height).toBeLessThan(panelBox.y);
      if (!sideBySide) expect(titleBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height);
    }
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
    const groupTitle = page.locator("#expense-group-title");
    const before = await whileGroupReadsAreBlocked(async () => {
      await navigate();
      await expect(status).toBeAttached();
      await expect(loadingHeading).toBeVisible();
      if (heading !== "Spending trend") {
        await expect(skeleton.getByText("Spending trend", { exact: true })).toHaveCount(0);
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const mainBox = await expectFrame(skeleton, `${heading} skeleton`);
      const headingBox = (await loadingHeading.boundingBox())!;
      await expectFirstRowWidth(heading, loadingHeading, mainBox.width);
      const title = await groupTitle.count() > 0 ? await groupTitle.boundingBox() : null;
      return { top: mainBox.y, headingX: headingBox.x, headingY: headingBox.y, titleHeight: Math.max(40, title?.height ?? 0) };
    });
    await expect(status).toHaveCount(0);
    const loadedHeading = page.getByRole("heading", { name: heading, exact: true });
    await expect(loadedHeading).toBeVisible();
    const mainBox = await expectFrame(page.getByRole("main"), heading);
    await expectFirstRowWidth(heading, loadedHeading, mainBox.width);
    const title = (await groupTitle.boundingBox())!;
    const extraTitleHeight = Math.max(40, title.height) - before.titleHeight;
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
      await expectTopLevelFrame("/", "Overview", "Loading overview");
      const listSwitcher = await expectTopLevelFrame("/expense-groups", "Expense Groups", "Loading your expense groups");
      await expectSettingsFrame();
      await page.goto("/categories");
      const categories = page.getByRole("main");
      await expect(categories.getByText("Categories — coming soon.", { exact: true })).toBeVisible();
      await expectFrame(categories, "Categories placeholder");
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
      const groupSwitcher = await getAnchor(page.getByRole("button", { name: /switch expense group/i }));
      expect(groupSwitcher, `the list and individual group switchers align at ${width}px`).toEqual(listSwitcher);
      if (width >= 1100) {
        expect(scrollStates, `checked short and long tabs at ${width}px`).toEqual(new Set([true, false]));
      }
    }

    const tabs = page.getByRole("navigation", { name: "Expense group views" });
    const switcher = page.getByRole("button", { name: /switch expense group/i });
    const originalSwitcher = await switcher.elementHandle();
    async function expectSameSwitcher() {
      await expect(switcher).toBeVisible();
      expect(await switcher.evaluate((button, original) => button === original, originalSwitcher)).toBe(true);
    }
    await expectLoading(async () => {
      await tabs.getByRole("link", { name: "Expenses", exact: true }).click();
      await expect(status).toBeAttached();
      await expectSameSwitcher();
    }, "Expenses");
    await expectSameSwitcher();
    await switcher.click();
    await expect(page.getByRole("navigation", { name: "Switch expense group" })
      .getByRole("link", { name: "Browser daily expenses" }))
      .toHaveAttribute("href", `/expense-groups/${data.group.publicId}/expenses`);
  } finally {
    await database.end();
  }
});
