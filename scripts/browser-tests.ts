import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createAuth } from "../app/lib/auth/config";
import { getManilaToday, parseExpenseDate } from "../app/lib/expenses/date";
import { createNativeTestDatabase } from "../tests/helpers/native-database";
import type { BrowserData } from "../tests/browser/data";

const playwright = path.resolve("node_modules/@playwright/test/cli.js");
const browserEnv: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" };
for (const key of Object.keys(browserEnv)) {
  if (key.toUpperCase().startsWith("PG")) delete browserEnv[key];
}

function finished(child: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = finished(child);
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try { await exited; } finally { clearTimeout(timer); }
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP address");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function main() {
  if (process.argv[2] === "install") {
    const child = spawn(process.execPath, [playwright, ...process.argv.slice(2)], {
      env: browserEnv, stdio: "inherit", windowsHide: true,
    });
    process.exitCode = await finished(child);
    return;
  }
  await access(".next/BUILD_ID").catch(() => {
    throw new Error("Build the production application with npm run build before running browser tests");
  });
  const fixture = await createNativeTestDatabase();
  let server: ChildProcess | undefined;
  let tests: ChildProcess | undefined;
  const interrupted = new AbortController();
  const interrupt = () => interrupted.abort(new Error("Browser run interrupted"));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    const secret = randomBytes(32).toString("hex");
    const password = "Only for isolated browser tests 42!";
    const auth = createAuth(fixture.client, { secret, baseURL: origin });
    async function signup(email: string, name: string) {
      const response = await auth.handler(new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST", headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      }));
      if (!response.ok) throw new Error(`Could not seed browser account (${response.status})`);
      const result = await response.json() as { user: { id: string } };
      return result.user.id;
    }
    const email = "browser-owner@example.test";
    const userId = await signup(email, "Browser Owner");
    const otherId = await signup("browser-other@example.test", "Other Owner");
    const group = await fixture.client.expenseGroup.create({ data: {
      userId, name: "Browser daily expenses", categories: { create: [{ name: "Food" }, { name: "Travel" }] },
    }, include: { categories: { orderBy: { id: "asc" } } } });
    const merchants = await fixture.client.expenseGroup.create({ data: {
      userId, name: "Browser merchant search", categories: { create: { name: "Shopping" } },
    }, include: { categories: true } });
    const exported = await fixture.client.expenseGroup.create({ data: {
      userId, name: "Browser export history", categories: { create: { name: "Export category" } },
    }, include: { categories: true } });
    const largeExport = await fixture.client.expenseGroup.create({ data: {
      userId, name: "Browser large export history", categories: { create: { name: "Travel" } },
    }, include: { categories: true } });
    const foreign = await fixture.client.expenseGroup.create({ data: {
      userId: otherId, name: "Private foreign group", categories: { create: { name: "Foreign category" } },
    }, include: { categories: true } });
    const olderHistory = await fixture.client.expenseGroup.create({ data: {
      userId, name: "Browser older history", categories: { create: [{ name: "Travel" }] },
    }, include: { categories: true } });
    const dashboardBudgeted = await fixture.client.expenseGroup.create({ data: {
      userId, name: "Dashboard household", categories: { create: { name: "Food" } },
    }, include: { categories: true } });
    const dashboardUnbudgeted = await fixture.client.expenseGroup.create({ data: {
      userId, name: "Dashboard work", categories: { create: { name: "Food" } },
    }, include: { categories: true } });
    const dashboardMonth = "2020-04";
    const today = parseExpenseDate(getManilaToday());
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);
    await fixture.client.budget.create({ data: {
      expenseGroupId: dashboardBudgeted.id, budgetMonth: parseExpenseDate(`${dashboardMonth}-01`), amountCentavos: 20000,
    } });
    await fixture.client.recurringExpense.createMany({ data: [
      { expenseGroupId: dashboardBudgeted.id, categoryId: dashboardBudgeted.categories[0].id,
        title: "Scheduled internet", amountCentavos: 5000, frequency: "MONTHLY", startDate: tomorrow, nextDueDate: tomorrow },
      { expenseGroupId: dashboardUnbudgeted.id, categoryId: dashboardUnbudgeted.categories[0].id,
        title: "Review storage renewal", amountCentavos: 3500, frequency: "MONTHLY", startDate: today, nextDueDate: today, status: "NEEDS_ATTENTION" },
    ] });
    const date = new Date("2026-11-18T00:00:00Z");
    await fixture.client.expense.createMany({ data: [
      ...[...Array.from({ length: 30 }, (_, index) => `Merchant ${String(index).padStart(2, "0")}`), "Alpha Bakery", "Beta Cafe"].map((merchant) => ({
        expenseGroupId: merchants.id, categoryId: merchants.categories[0].id,
        title: `${merchant} purchase`, merchant, amountCentavos: 12345, date,
        ...(merchant === "Beta Cafe" && { paymentMethod: "CASH" as const, legacyBankName: "Browser Test Bank" }),
      })),
      ...Array.from({ length: 35 }, (_, index) => ({
        expenseGroupId: exported.id, categoryId: exported.categories[0].id,
        title: `Export expense ${index + 1}${index === 34 ? " 午餐 🍱 中文" : ""}`,
        merchant: index === 34 ? "台灣商店 🛒 𠮷野家" : "Export Market",
        notes: index === 34 ? "日本語 コーヒー・スーパー 한국어 👩🏽‍💻 🇵🇭" : null,
        amountCentavos: 10, date,
      })),
      { expenseGroupId: foreign.id, categoryId: foreign.categories[0].id, title: "Foreign secret", amountCentavos: 99999, date },
      { expenseGroupId: dashboardBudgeted.id, categoryId: dashboardBudgeted.categories[0].id,
        title: "Household groceries", merchant: "Local Market", amountCentavos: 1025, date: parseExpenseDate(`${dashboardMonth}-04`) },
      { expenseGroupId: dashboardBudgeted.id, categoryId: dashboardBudgeted.categories[0].id,
        title: "Previous month groceries", merchant: "Local Market", amountCentavos: 725, date: parseExpenseDate("2020-03-04") },
      { expenseGroupId: dashboardUnbudgeted.id, categoryId: dashboardUnbudgeted.categories[0].id,
        title: "Work groceries", merchant: "Local Market", amountCentavos: 2250, date: parseExpenseDate(`${dashboardMonth}-08`) },
      {
        expenseGroupId: olderHistory.id, categoryId: olderHistory.categories[0].id,
        title: "Older train ticket", amountCentavos: 18500, date: new Date("2020-01-15T00:00:00Z"),
      },
    ] });
    await fixture.client.expense.createMany({ data: [
      ...Array.from({ length: 5_000 }, (_, index) => ({
        expenseGroupId: largeExport.id, categoryId: largeExport.categories[0].id,
        title: `Large report expense ${String(index + 1).padStart(4, "0")}`,
        merchant: "City Transport", amountCentavos: 123, date,
        notes: index === 0 ? [
          "Receipt starts here",
          ...Array.from({ length: 70 }, (_, line) => `Travel receipt detail ${line + 1}`),
          "Receipt ends here",
        ].join("\n") : null,
      })),
      {
        expenseGroupId: largeExport.id, categoryId: largeExport.categories[0].id,
        title: "Outside report date", amountCentavos: 456, date: new Date("2026-11-17T00:00:00Z"),
      },
    ] });
    const spayLater = await fixture.client.expenseGroup.create({
      data: { userId, name: "Browser SPayLater billing", categories: { create: { name: "Shopping" } } },
      select: { id: true, publicId: true, categories: { select: { id: true } } },
    });
    await fixture.client.payLaterProviderAssignment.create({
      data: { expenseGroupId: spayLater.id, userId, providerKey: "shopee" },
    });
    await fixture.client.expense.createMany({
      data: [
        { title: "Same-cycle Shopee purchase", amountCentavos: 10000, paymentMethod: "CASH" as const },
        {
          title: "Other-cycle Shopee purchase", amountCentavos: 6000, paymentMethod: "PAY_LATER" as const,
          payLaterProviderKey: "shopee", payLaterProviderName: "SPayLater",
        },
      ].map((purchase) => ({
        ...purchase, expenseGroupId: spayLater.id, categoryId: spayLater.categories[0].id,
        date: parseExpenseDate("2026-06-26"),
      })),
    });

    const data: BrowserData = {
      email, password, userId,
      group: { id: group.id, publicId: group.publicId, categoryId: group.categories[0].id },
      merchants: { id: merchants.id, publicId: merchants.publicId },
      exported: { id: exported.id, publicId: exported.publicId },
      largeExport: { publicId: largeExport.publicId },
      foreign: { id: foreign.id, publicId: foreign.publicId },
      olderHistory: { publicId: olderHistory.publicId },
      spayLater: { publicId: spayLater.publicId },
      dashboard: { month: dashboardMonth, budgeted: dashboardBudgeted.publicId, unbudgeted: dashboardUnbudgeted.publicId },
    };
    const env: NodeJS.ProcessEnv = {
      ...browserEnv, NODE_ENV: "production", DATABASE_URL: fixture.connectionString,
      DIRECT_URL: fixture.connectionString, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin,
      CRON_SECRET: randomBytes(32).toString("hex"),
      REDTALLY_BROWSER_ORIGIN: origin, REDTALLY_BROWSER_DATA: JSON.stringify(data),
      REDTALLY_BROWSER_DATABASE_URL: fixture.connectionString,
    };
    const productionServer = server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env, stdio: "inherit", windowsHide: true,
    });
    productionServer.once("error", interrupt);
    const deadline = Date.now() + 60_000;
    while (true) {
      interrupted.signal.throwIfAborted();
      if (productionServer.exitCode !== null) throw new Error("Production server exited before becoming ready");
      const response = await fetch(`${origin}/sign-in`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
      if (response?.ok) break;
      if (Date.now() > deadline) throw new Error("Production server did not become ready within 60 seconds");
      await delay(200, undefined, { signal: interrupted.signal });
    }
    console.log(`Browser smoke uses a disposable database and production server at ${origin}`);
    tests = spawn(process.execPath, [playwright, "test", ...process.argv.slice(2)], {
      env, stdio: "inherit", windowsHide: true, signal: interrupted.signal,
    });
    process.exitCode = await finished(tests);
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    try { await stop(tests); } finally {
      try { await stop(server); } finally { await fixture.close(); }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
