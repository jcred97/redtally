import { createTestDatabase } from "../helpers/database";
import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { drainRecurringExpenses, runRecurringExpenses } from "../../app/(dashboard)/_lib/recurring-expenses/worker";
import { parseExpenseDate } from "../../app/lib/expenses/date";

test("recurring expense worker posts each due occurrence atomically", async (t) => {
  const fixture = await createTestDatabase(2);
  const { client, db } = fixture;

  try {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('RecurringExpense', 'RecurringExpenseOccurrence', 'RecurringExpenseSubmission')
      ORDER BY relname
    `);
    assert.deepEqual(tables.rows, [
      { relname: "RecurringExpense", relrowsecurity: true },
      { relname: "RecurringExpenseOccurrence", relrowsecurity: true },
      { relname: "RecurringExpenseSubmission", relrowsecurity: true },
    ]);
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

    await t.test("catches up each schedule in order, keeps month anchors, and includes the end date", async () => {
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
        assert.equal(expense?.timeMinutes, null);
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

    await t.test("one drain posts more than the single-batch limit", async () => {
      const endDate = parseExpenseDate("2027-06-24");
      const rule = await createRule("2027-05-01", { frequency: "DAILY", endDate });

      assert.deepEqual(await drainRecurringExpenses(client, endDate, () => true), {
        generated: 55, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: false,
      });
      assert.equal(await client.recurringExpenseOccurrence.count({
        where: { recurringExpenseId: rule.id, expenseId: { not: null } },
      }), 55);
    });

    await t.test("a drain stops between occurrences when its budget expires and the next drain resumes", async () => {
      const endDate = parseExpenseDate("2027-07-05");
      const rule = await createRule("2027-07-01", { frequency: "DAILY", endDate });
      let checksRemaining = 2;

      assert.deepEqual(await drainRecurringExpenses(client, endDate, () => checksRemaining-- > 0), {
        generated: 2, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: true,
      });
      const current = await client.recurringExpense.findUniqueOrThrow({ where: { id: rule.id } });
      assert.deepEqual(current.nextDueDate, parseExpenseDate("2027-07-03"));

      assert.deepEqual(await drainRecurringExpenses(client, endDate, () => true), {
        generated: 3, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: false,
      });
      assert.equal(await client.recurringExpenseOccurrence.count({ where: { recurringExpenseId: rule.id } }), 5);
    });

    await t.test("another owner's due schedule gets a turn before a backfill takes a second slot", async () => {
      const today = parseExpenseDate("2027-08-10");
      const backlog = await createRule("2027-08-01", { frequency: "DAILY", endDate: today });
      const otherGroup = await client.expenseGroup.create({
        data: {
          name: "Bills", user: { create: { id: "other", name: "Other", email: "other@example.test" } },
          categories: { create: { name: "Utilities" } },
        },
        include: { categories: true },
      });
      const dueToday = await createRule("2027-08-10", {
        expenseGroupId: otherGroup.id, categoryId: otherGroup.categories[0].id, endDate: today,
      });

      // Each invocation has time for just one occurrence. Fairness must survive a restart.
      for (const expectedRule of [backlog, dueToday]) {
        let slots = 1;
        const result = await drainRecurringExpenses(client, today, () => slots-- > 0);
        assert.equal(result.generated, 1);
        assert.equal(result.hasCatchUpRemaining, true);
        const first = await client.recurringExpenseOccurrence.findUniqueOrThrow({
          where: { recurringExpenseId_dueDate: { recurringExpenseId: expectedRule.id, dueDate: expectedRule.startDate } },
        });
        assert.ok(first.expenseId);
      }
      assert.equal(await client.recurringExpenseOccurrence.count({ where: { recurringExpenseId: backlog.id } }), 1);
      const remaining = await drainRecurringExpenses(client, today, () => true);
      assert.equal(remaining.generated, 9);
      assert.equal(remaining.hasCatchUpRemaining, false);
    });
  } finally {
    await fixture.close();
  }
});

test("a drain exits when all due work is locked by another invocation", async () => {
  let claims = 0;
  // The claim skips locked rows, while the backlog query can still see them.
  const client = {
    async $transaction(work: (tx: { $queryRaw(): Promise<never[]> }) => Promise<unknown>) {
      assert.equal(++claims, 1);
      return work({ $queryRaw: async () => [] });
    },
    $queryRaw: async () => [{ exists: true }],
  } as unknown as PrismaClient;

  assert.deepEqual(await drainRecurringExpenses(client, parseExpenseDate("2027-04-01"), () => true), {
    generated: 0, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: true,
  });
  assert.equal(claims, 1);
});
