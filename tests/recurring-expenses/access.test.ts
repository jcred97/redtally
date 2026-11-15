import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { createCategoryAccess } from "../../app/(dashboard)/_lib/categories/access";
import { createRecurringExpenseAccess } from "../../app/(dashboard)/_lib/recurring-expenses/access";
import { runRecurringExpenses } from "../../app/(dashboard)/_lib/recurring-expenses/worker";
import { parseExpenseDate } from "../../app/lib/expenses/date";

test("recurring expense commands enforce ownership and preserve the intended schedule", async () => {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0 });
  let client: PrismaClient | undefined;

  try {
    const directory = path.join(process.cwd(), "server/db/migrations");
    const entries = await readdir(directory, { withFileTypes: true });
    for (const name of entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
      await db.exec(await readFile(path.join(directory, name, "migration.sql"), "utf8"));
    }
    await server.start();
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }),
    });
    await client.user.createMany({ data: [
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
    ] });
    const group = await client.expenseGroup.create({ data: { name: "Home", userId: "alice" } });
    const foreignGroup = await client.expenseGroup.create({ data: { name: "Private", userId: "bob" } });
    const category = await client.category.create({ data: { name: "Internet", expenseGroupId: group.id } });
    const foreignCategory = await client.category.create({ data: { name: "Other", expenseGroupId: foreignGroup.id } });
    const today = () => parseExpenseDate("2026-03-31");
    const alice = createRecurringExpenseAccess(client, async () => "alice", today);
    const bob = createRecurringExpenseAccess(client, async () => "bob", today);
    const categories = createCategoryAccess(client, async () => "alice");
    const draft = (overrides: Record<string, string> = {}) => {
      const data = new FormData();
      for (const [name, value] of Object.entries({
        title: "Internet", amount: "1499.75", categoryId: String(category.id),
        frequency: "MONTHLY", startDate: "2026-01-31", ...overrides,
      })) data.set(name, value);
      return data;
    };

    await assert.rejects(bob.change(group.id, null, "create", draft()), /not found/);
    await assert.rejects(alice.change(group.id, null, "create", draft({ categoryId: String(foreignCategory.id) })), /this expense group/);
    await assert.rejects(alice.change(group.id, null, "create", draft({ endDate: "2026-01-30" })), /on or after/);
    assert.deepEqual(await alice.list(group.id), []);
    await alice.change(group.id, null, "create", draft());
    const [rule] = await alice.list(group.id);
    assert.equal(rule.amountCentavos, 149975);
    assert.deepEqual(await bob.list(group.id), []);
    await assert.rejects(bob.change(group.id, rule.id, "pause", draft()), /not found/);
    await assert.rejects(alice.change(foreignGroup.id, rule.id, "delete", draft()), /not found/);
    await assert.rejects(categories.delete(group.id, category.id), /recurring expenses first/);

    await alice.change(group.id, rule.id, "pause", new FormData());
    assert.equal((await runRecurringExpenses(client, today())).generated, 0);
    const backfill = new FormData();
    backfill.set("backfill", "on");
    await alice.change(group.id, rule.id, "resume", backfill);
    assert.equal((await alice.list(group.id))[0].nextDueDate.toISOString().slice(0, 10), "2026-01-31");
    await alice.change(group.id, rule.id, "pause", new FormData());
    await alice.change(group.id, rule.id, "resume", new FormData());
    assert.equal((await alice.list(group.id))[0].nextDueDate.toISOString().slice(0, 10), "2026-03-31");

    const otherGroup = await client.expenseGroup.create({ data: { name: "Other", userId: "alice" } });
    const otherCategory = await client.category.create({ data: { name: "Utilities", expenseGroupId: otherGroup.id } });
    const dueToday = { startDate: "2026-03-31", endDate: "2026-03-31" };
    await alice.change(otherGroup.id, null, "create", draft({ ...dueToday, categoryId: String(otherCategory.id) }));
    await bob.change(foreignGroup.id, null, "create", draft({ ...dueToday, categoryId: String(foreignCategory.id) }));

    await assert.rejects(bob.runDue(group.id), /not found/i);
    await assert.rejects(alice.runDue(foreignGroup.id), /not found/i);
    const signedOut = createRecurringExpenseAccess(client, async () => { throw new Error("Sign in required"); }, today);
    await assert.rejects(signedOut.runDue(group.id), /Sign in required/);
    assert.equal(await client.expense.count(), 0);
    assert.deepEqual(await alice.runDue(group.id), {
      generated: 1, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: false,
    });
    assert.deepEqual(await alice.runDue(group.id), {
      generated: 0, needsAttention: 0, alreadyRecorded: 0, hasCatchUpRemaining: false,
    });
    assert.equal(await client.expense.count({ where: { expenseGroupId: { not: group.id } } }), 0);
    assert.equal((await runRecurringExpenses(client, today())).generated, 2);

    await alice.change(group.id, rule.id, "edit", draft({ startDate: "2026-03-31", frequency: "DAILY" }));
    assert.equal((await alice.list(group.id))[0].nextDueDate.toISOString().slice(0, 10), "2026-04-01");
    await alice.change(group.id, rule.id, "delete", new FormData());
    assert.equal((await alice.list(group.id)).length, 0);
    assert.equal(await client.expense.count({ where: { expenseGroupId: group.id } }), 1);
  } finally {
    await client?.$disconnect();
    await server.stop();
    await db.close();
  }
});
