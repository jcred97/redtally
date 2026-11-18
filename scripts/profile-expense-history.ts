import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createExpenseGroupAccess, ExpenseGroupAccessError } from "../app/(dashboard)/_lib/expense-groups/access";
import { createTestDatabase } from "../tests/helpers/database";
import { createNativeTestDatabase } from "../tests/helpers/native-database";

const native = process.argv.includes("--native");
const sizes = process.argv.slice(2).filter((arg) => arg !== "--native").map(Number);
let hasFailedDuplication = false;
if (sizes.some((size) => !Number.isSafeInteger(size) || size < 25 || size > 1_000_000)) {
  throw new Error("Sizes must be integers from 25 to 1000000.");
}

async function measure<T>(action: () => Promise<T>) {
  const startMemory = process.memoryUsage();
  let peakRss = startMemory.rss;
  let peakHeap = startMemory.heapUsed;
  const sample = () => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
  };
  const timer = setInterval(sample, 10);
  const start = performance.now();
  try {
    const value = await action();
    sample();
    return {
      value,
      ms: Math.round((performance.now() - start) * 10) / 10,
      rssIncreaseMiB: Math.round((peakRss - startMemory.rss) / 104857.6) / 10,
      heapIncreaseMiB: Math.round((peakHeap - startMemory.heapUsed) / 104857.6) / 10,
    };
  } finally {
    clearInterval(timer);
  }
}

async function profile(size: number) {
  const fixture = await (native ? createNativeTestDatabase() : createTestDatabase());
  const { db, client: prisma, close } = fixture;
  try {
    if ("version" in fixture) console.log(JSON.stringify({ databaseVersion: fixture.version }));
    await prisma.user.createMany({ data: [
      { id: "owner", name: "Owner", email: "owner@example.test" },
      { id: "other", name: "Other", email: "other@example.test" },
    ] });
    const owner = createExpenseGroupAccess(prisma, async () => "owner");
    const other = createExpenseGroupAccess(prisma, async () => "other");
    const source = await owner.create(`Synthetic ${size}`);
    const categories = await prisma.category.createManyAndReturn({
      data: Array.from({ length: 12 }, (_, index) => ({ expenseGroupId: source.id, name: `Category ${index}` })),
    });
    const bank = await prisma.bank.findFirstOrThrow();
    const assignment = await prisma.bankAssignment.create({ data: { expenseGroupId: source.id, bankId: bank.id } });
    await prisma.budget.create({ data: { expenseGroupId: source.id, budgetMonth: new Date("2026-11-01"), amountCentavos: 500000 } });

    // Generate deterministic rows inside the isolated database; exclude seeding from timings.
    await db.query(`
      INSERT INTO "Expense" (title, merchant, "amountCentavos", date, "timeMinutes", "categoryId", "expenseGroupId", "bankAssignmentId", "transactionType", "updatedAt")
      SELECT 'Expense ' || n, 'Merchant ' || (n % 250), 100 + (n % 100000),
        timestamp '2026-11-18' - (n % 1095) * interval '1 day',
        CASE WHEN n % 4 = 0 THEN NULL ELSE n % 1440 END,
        ($1::int[])[1 + (n % 12)], $2, $3, 'DEBIT_CARD'::"TransactionType", now()
      FROM generate_series(1, $4::int) AS n
    `, [categories.map((category) => category.id), source.id, assignment.id, size]);
    await db.exec('ANALYZE "Expense"; ANALYZE "Category"; ANALYZE "Spending";');

    assert.equal(await other.getExpensePageById(source.id, 1), null);
    await assert.rejects(other.duplicate(source.id), ExpenseGroupAccessError);
    assert.equal(await prisma.expenseGroup.count(), 1);

    const results: Record<string, unknown>[] = [];
    const lastPage = Math.ceil(size / 25);
    assert.equal((await owner.getExpensePageById(source.id, lastPage + 100))?.page, lastPage);
    for (const [label, page, grouped, filters] of [
      ["first", 1, false, {}],
      ["last", lastPage, false, {}],
      ["last-grouped", lastPage, true, {}],
      ["month", 1, false, { month: "2026-11" }],
    ] as const) {
      await owner.getExpensePageById(source.id, page, filters, grouped);
      const timings = [];
      for (let run = 0; run < 5; run++) {
        const measured = await measure(() => owner.getExpensePageById(source.id, page, filters, grouped));
        assert.ok(measured.value);
        assert.ok(measured.value.expenses.length <= 25);
        if (label !== "month") {
          assert.equal(measured.value.totalExpenses, size);
          assert.equal(measured.value.page, page);
          assert.equal(measured.value.expenses.length, page === lastPage ? size - (page - 1) * 25 : 25);
        }
        timings.push(measured.ms);
      }
      timings.sort((a, b) => a - b);
      results.push({ operation: label, medianMs: timings[2], minMs: timings[0], maxMs: timings[4] });
    }

    const before = await prisma.expense.aggregate({ where: { expenseGroupId: source.id }, _count: true, _sum: { amountCentavos: true } });
    const duplicate = await measure(async () => {
      try {
        return { copy: await owner.duplicate(source.id), error: null };
      } catch (error) {
        return { copy: null, error: error instanceof Error ? error : new Error(String(error)) };
      }
    });
    const metrics = { ms: duplicate.ms, rssIncreaseMiB: duplicate.rssIncreaseMiB, heapIncreaseMiB: duplicate.heapIncreaseMiB };
    if (!duplicate.value.copy) {
      assert.equal(await prisma.expenseGroup.count(), 1, "Failed duplication must roll back the new group");
      assert.deepEqual(await prisma.expense.aggregate({ where: { expenseGroupId: source.id }, _count: true, _sum: { amountCentavos: true } }), before);
      const error = duplicate.value.error;
      results.push({ operation: "duplicate", ...metrics, error: error?.message, errorCode: error && "code" in error ? error.code : undefined, rollbackVerified: true });
      console.log(JSON.stringify({ expenses: size, results }));
      hasFailedDuplication = true;
      return;
    }
    const copy = duplicate.value.copy;
    const after = await prisma.expense.aggregate({ where: { expenseGroupId: copy.id }, _count: true, _sum: { amountCentavos: true } });
    assert.deepEqual(after, before);
    assert.equal(await prisma.category.count({ where: { expenseGroupId: copy.id } }), 12);
    assert.equal(await prisma.budget.count({ where: { expenseGroupId: copy.id } }), 1);
    assert.equal(await prisma.expense.count({ where: { expenseGroupId: copy.id, bankAssignment: { expenseGroupId: copy.id } } }), size);
    assert.equal(await other.getExpensePageById(copy.id, 1), null);
    results.push({ operation: "duplicate", ...metrics });
    console.log(JSON.stringify({ expenses: size, results }));
  } finally {
    await close();
  }
}

async function main() {
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, engine: native ? "isolated native PostgreSQL" : "isolated PGlite", pageSize: 25 }));
  for (const size of sizes.length ? sizes : [1000, 10000, 50000]) await profile(size);
  if (hasFailedDuplication) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
