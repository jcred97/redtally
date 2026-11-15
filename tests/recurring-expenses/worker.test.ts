import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../generated/prisma/client";
import { runRecurringExpenses } from "../../app/(dashboard)/_lib/recurring-expenses/worker";
import { parseExpenseDate } from "../../app/lib/expenses/date";

test("recurring expense worker posts each due occurrence atomically", async (t) => {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 2 });
  let prisma: PrismaClient | undefined;

  try {
    const directory = path.join(process.cwd(), "server/db/migrations");
    const entries = await readdir(directory, { withFileTypes: true });
    const migrations = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const migration of migrations) {
      await db.exec(await readFile(path.join(directory, migration, "migration.sql"), "utf8"));
    }
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('RecurringExpense', 'RecurringExpenseOccurrence')
      ORDER BY relname
    `);
    assert.deepEqual(tables.rows, [
      { relname: "RecurringExpense", relrowsecurity: true },
      { relname: "RecurringExpenseOccurrence", relrowsecurity: true },
    ]);

    await server.start();
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`,
        max: 2,
      }),
    });
    const client = prisma;
    const owner = await client.user.create({ data: { id: "owner", name: "Owner", email: "owner@example.test" } });
    const group = await client.expenseGroup.create({ data: { name: "Home", userId: owner.id } });
    const category = await client.category.create({ data: { name: "Utilities", expenseGroupId: group.id } });
    const legacyGroup = await client.expenseGroup.create({ data: { name: "Unclaimed" } });
    const legacyCategory = await client.category.create({ data: { name: "Utilities", expenseGroupId: legacyGroup.id } });
    const run = (date: string, limit?: number) => runRecurringExpenses(client, parseExpenseDate(date), limit);

    function createRule(start: string, overrides: Partial<Prisma.RecurringExpenseUncheckedCreateInput> = {}) {
      const startDate = parseExpenseDate(start);
      return client.recurringExpense.create({
        data: {
          title: "Internet",
          amountCentavos: 149_950,
          expenseGroupId: group.id,
          categoryId: category.id,
          frequency: "MONTHLY",
          startDate,
          nextDueDate: startDate,
          ...overrides,
        },
      });
    }

    await t.test("catches up in due date order, keeps month anchors, and includes the end date", async () => {
      const rule = await createRule("2027-01-31", { endDate: parseExpenseDate("2027-03-31") });
      const paused = await createRule("2027-01-31", { status: "PAUSED" });
      const unclaimed = await createRule("2027-01-31", {
        expenseGroupId: legacyGroup.id,
        categoryId: legacyCategory.id,
      });
      const furtherDue = await createRule("2027-02-01", { endDate: parseExpenseDate("2027-02-01") });

      assert.deepEqual(await run("2027-04-01", 2), {
        generated: 2, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: true,
      });
      const firstBatch = await client.recurringExpenseOccurrence.findMany({ orderBy: { dueDate: "asc" } });
      assert.deepEqual(firstBatch.map(({ recurringExpenseId }) => recurringExpenseId), [rule.id, furtherDue.id]);

      assert.deepEqual(await run("2027-04-01"), {
        generated: 2, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: false,
      });
      const occurrences = await client.recurringExpenseOccurrence.findMany({
        where: { recurringExpenseId: rule.id },
        orderBy: { dueDate: "asc" },
        include: { expense: true },
      });
      assert.deepEqual(occurrences.map(({ dueDate }) => dueDate), [
        parseExpenseDate("2027-01-31"), parseExpenseDate("2027-02-28"), parseExpenseDate("2027-03-31"),
      ]);
      for (const { dueDate, expense } of occurrences) {
        assert.equal(expense?.amountCentavos, 149_950);
        assert.equal(expense?.expenseGroupId, group.id);
        assert.equal(expense?.categoryId, category.id);
        assert.deepEqual(expense?.date, dueDate);
      }
      assert.equal(await client.recurringExpenseOccurrence.count({
        where: { recurringExpenseId: { in: [paused.id, unclaimed.id] } },
      }), 0);
    });

    await t.test("overlapping invocations and retries produce only one expense", async () => {
      const date = "2027-04-05";
      const rule = await createRule(date, { endDate: parseExpenseDate(date) });
      const results = await Promise.all([run(date), run(date)]);
      assert.deepEqual(results.map(({ generated }) => generated).sort(), [0, 1]);
      assert.equal((await run(date)).generated, 0);
      const where = { recurringExpenseId_dueDate: { recurringExpenseId: rule.id, dueDate: parseExpenseDate(date) } };
      const occurrence = await client.recurringExpenseOccurrence.findUniqueOrThrow({ where });
      assert.notEqual(occurrence.expenseId, null);
      await client.expense.delete({ where: { id: occurrence.expenseId! } });
      assert.equal((await client.recurringExpenseOccurrence.findUniqueOrThrow({ where })).expenseId, null);

      // Simulate a replay of the same due date even if its schedule pointer is stale.
      await client.recurringExpense.update({ where: { id: rule.id }, data: { nextDueDate: occurrence.dueDate } });
      assert.deepEqual(await run(date), {
        generated: 0, needsAttention: 0, alreadyRecorded: 1, hasCatchUpRemaining: false,
      });
      assert.equal((await client.recurringExpenseOccurrence.findUniqueOrThrow({ where })).expenseId, null);
    });

    await t.test("a disabled bank blocks its rule without delaying other expenses", async () => {
      const date = "2027-04-06";
      const dueDate = parseExpenseDate(date);
      const bank = await client.bank.create({ data: { name: "Worker test bank", key: "worker test bank" } });
      const assignment = await client.bankAssignment.create({
        data: { bankId: bank.id, expenseGroupId: group.id, active: false },
      });
      const blocked = await createRule(date, { bankAssignmentId: assignment.id, paymentMethod: "DEBIT_CARD" });
      await createRule(date, { endDate: dueDate });

      assert.deepEqual(await run(date), {
        generated: 1, needsAttention: 1, alreadyRecorded: 0, hasCatchUpRemaining: false,
      });
      const changed = await client.recurringExpense.findUniqueOrThrow({ where: { id: blocked.id } });
      assert.equal(changed.status, "NEEDS_ATTENTION");
      assert.deepEqual(changed.nextDueDate, dueDate);
      assert.equal(await client.recurringExpenseOccurrence.count({ where: { recurringExpenseId: blocked.id } }), 0);
    });

    await t.test("a failed occurrence insert rolls back the expense and can be retried", async () => {
      const date = "2027-04-07";
      const dueDate = parseExpenseDate(date);
      const rule = await createRule(date, { endDate: dueDate });
      const count = await client.expense.count();
      await client.$executeRaw`
        ALTER TABLE "RecurringExpenseOccurrence"
        ADD CONSTRAINT "worker_test_reject_expense_link" CHECK ("expenseId" IS NULL) NOT VALID
      `;
      try {
        await assert.rejects(run(date), /worker_test_reject_expense_link/);
        assert.equal(await client.expense.count(), count);
        const current = await client.recurringExpense.findUniqueOrThrow({ where: { id: rule.id } });
        assert.deepEqual(current.nextDueDate, dueDate);
      } finally {
        await client.$executeRaw`ALTER TABLE "RecurringExpenseOccurrence" DROP CONSTRAINT "worker_test_reject_expense_link"`;
      }
      assert.equal((await run(date)).generated, 1);
      assert.equal(await client.expense.count(), count + 1);
    });

    await t.test("a rule cannot reference another group's category", async () => {
      await assert.rejects(createRule("2027-01-31", { categoryId: legacyCategory.id }), { code: "P2003" });
    });
  } finally {
    await prisma?.$disconnect();
    await server.stop();
    await db.close();
  }
});
