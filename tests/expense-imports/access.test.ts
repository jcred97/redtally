import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { createExpenseImportAccess } from "../../app/(dashboard)/_lib/expense-imports/access";
import { MAX_IMPORT_ROWS } from "../../app/lib/expenses/import";

test("expense imports check ownership, report matches, and save atomically", async (t) => {
  const database = await PGlite.create();
  const server = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0 });
  let prisma: PrismaClient | undefined;

  try {
    const directory = path.join(process.cwd(), "server/db/migrations");
    const migrations = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) {
      await database.exec(await readFile(path.join(directory, migration, "migration.sql"), "utf8"));
    }

    await server.start();
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`,
        max: 1,
      }),
    });
    const client = prisma;

    await client.user.createMany({ data: [
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
    ] });
    const aliceGroup = await client.expenseGroup.create({ data: { name: "Alice", userId: "alice" } });
    const bobGroup = await client.expenseGroup.create({ data: { name: "Bob", userId: "bob" } });
    const category = await client.category.create({ data: { name: "Food", expenseGroupId: aliceGroup.id } });
    const otherCategory = await client.category.create({ data: { name: "Other", expenseGroupId: aliceGroup.id } });
    const foreignCategory = await client.category.create({ data: { name: "Food", expenseGroupId: bobGroup.id } });
    const imports = createExpenseImportAccess(client, async () => "alice");
    const draft = { title: "Lunch", amount: "150.75", date: "2026-10-27" };
    const first = { ...draft, rowNumber: 2, submissionId: randomUUID() };
    const second = { ...draft, rowNumber: 3, submissionId: randomUUID() };

    await client.expense.createMany({ data: [
      {
        title: "  LUNCH  ",
        amountCentavos: 15075,
        date: new Date("2026-10-27T12:00:00.000Z"),
        categoryId: otherCategory.id,
        expenseGroupId: aliceGroup.id,
      },
      {
        title: "Dinner",
        amountCentavos: 15075,
        date: new Date("2026-10-27T00:00:00.000Z"),
        categoryId: foreignCategory.id,
        expenseGroupId: bobGroup.id,
      },
    ] });

    await t.test("preview matches calendar date, cents, and title in the selected group", async () => {
      assert.deepEqual(await imports.preview(aliceGroup.id, [
        first,
        { ...second, title: "Dinner" },
        { ...first, rowNumber: 4, submissionId: randomUUID(), date: "2026-10-28" },
        { ...first, rowNumber: 5, submissionId: randomUUID(), amount: "150.76" },
      ]), [2]);
      assert.equal(await client.expense.count(), 2);
    });

    await t.test("foreign group, mismatched category, and unauthenticated actions are rejected", async () => {
      await assert.rejects(imports.preview(bobGroup.id, [first]), /Expense group not found/);
      await assert.rejects(imports.save(bobGroup.id, foreignCategory.id, [first]), /Category not found/);
      await assert.rejects(imports.save(aliceGroup.id, foreignCategory.id, [first]), /Category not found/);
      const anonymous = createExpenseImportAccess(client, async () => { throw new Error("Sign in required"); });
      await assert.rejects(anonymous.preview(aliceGroup.id, null), /Sign in required/);
      await assert.rejects(anonymous.save(aliceGroup.id, category.id, null), /Sign in required/);
    });

    await t.test("invalid rows cannot write a partial batch and distinct submissions may match", async () => {
      await assert.rejects(imports.save(aliceGroup.id, category.id, [first, { ...second, amount: "-1" }]), /Row 3/);
      await assert.rejects(imports.save(aliceGroup.id, category.id, [first, { ...second, submissionId: first.submissionId }]), /repeats a draft ID/);
      assert.equal(await client.expenseSubmission.count(), 0);
      assert.equal(await imports.save(aliceGroup.id, category.id, [first, second]), 2);
      assert.equal(await imports.save(aliceGroup.id, category.id, [second, first]), 2);
      const expenses = await client.expense.findMany({ where: { categoryId: category.id } });
      assert.equal(expenses.length, 2);
      assert.ok(expenses.every((expense) => expense.amountCentavos === 15075
        && expense.date.toISOString() === "2026-10-27T00:00:00.000Z"));
    });

    await t.test("changed draft retries roll back entirely and deleted expenses stay deleted", async () => {
      const newDraft = { ...draft, rowNumber: 4, submissionId: randomUUID() };
      await assert.rejects(imports.save(aliceGroup.id, category.id, [
        newDraft, { ...second, title: "Changed" },
      ]), /Row 3 was already saved with different details/);
      assert.equal(await client.expenseSubmission.count(), 2);
      const submission = await client.expenseSubmission.findFirstOrThrow({ where: { id: second.submissionId } });
      assert.ok(submission.expenseId);
      await client.expense.delete({ where: { id: submission.expenseId } });
      await assert.rejects(imports.save(aliceGroup.id, category.id, [second]), /Row 3 was already saved and has since been deleted/);
      assert.equal(await client.expense.count({ where: { categoryId: category.id } }), 1);
    });

    await t.test("the maximum batch previews and saves in one transaction", async () => {
      const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, index) => ({
        ...draft,
        amount: String(index + 1),
        rowNumber: index + 2,
        submissionId: randomUUID(),
      }));
      const oversized = [...rows, first];
      await assert.rejects(imports.preview(aliceGroup.id, oversized), /Choose between/);
      await assert.rejects(imports.save(aliceGroup.id, category.id, oversized), /Choose between/);
      assert.deepEqual(await imports.preview(aliceGroup.id, rows), []);
      assert.equal(await imports.save(aliceGroup.id, category.id, rows), MAX_IMPORT_ROWS);
      assert.equal(await client.expense.count({ where: { categoryId: category.id } }), MAX_IMPORT_ROWS + 1);
    });
  } finally {
    await prisma?.$disconnect();
    await server.stop();
    await database.close();
  }
});
