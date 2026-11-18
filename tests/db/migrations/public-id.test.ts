import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const publicIdMigration = "20261118010000_expense_group_public_id";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("public IDs backfill groups without changing ownership or linked records and default for new groups", async () => {
  // This isolated database never reads the application's connection settings.
  const db = new PGlite();
  try {
    const directory = path.join(process.cwd(), "server/db/migrations");
    const migrations = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name < publicIdMigration)
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) {
      await db.exec(await readFile(path.join(directory, migration, "migration.sql"), "utf8"));
    }

    await db.exec(`
      INSERT INTO "user" (id, name, email, "updatedAt") VALUES ('owner', 'Owner', 'owner@example.test', NOW());
      INSERT INTO "Spending" (id, name, "userId", "createdAt", "updatedAt") VALUES
        (7, 'Personal', 'owner', '2026-01-01', '2026-11-17'),
        (8, 'Preserved legacy', NULL, '2026-02-01', '2026-11-16');
      INSERT INTO "Category" (id, name, "spendingId") VALUES (11, 'Food', 7);
      INSERT INTO "Expense" (id, title, "amountCentavos", date, "categoryId", "expenseGroupId", "updatedAt")
        VALUES (21, 'Lunch', 12345, '2026-11-17', 11, 7, NOW());
      INSERT INTO "Budget" ("expenseGroupId", "budgetMonth", "amountCentavos", "updatedAt")
        VALUES (7, '2026-11-01', 50000, NOW());
    `);
    const beforeGroups = (await db.query(`SELECT * FROM "Spending" ORDER BY id`)).rows;
    const beforeCategories = (await db.query(`SELECT * FROM "Category" ORDER BY id`)).rows;
    const beforeExpenses = (await db.query(`SELECT * FROM "Expense" ORDER BY id`)).rows;
    const beforeBudgets = (await db.query(`SELECT * FROM "Budget" ORDER BY id`)).rows;

    await db.exec(await readFile(path.join(directory, publicIdMigration, "migration.sql"), "utf8"));
    const afterGroups = (await db.query<Record<string, unknown> & { publicId: string }>(
      `SELECT * FROM "Spending" ORDER BY id`,
    )).rows;
    assert.deepEqual(afterGroups.map(({ publicId, ...group }) => {
      assert.match(publicId, uuidPattern);
      return group;
    }), beforeGroups);
    assert.equal(new Set(afterGroups.map(({ publicId }) => publicId)).size, 2);
    assert.deepEqual((await db.query(`SELECT * FROM "Category" ORDER BY id`)).rows, beforeCategories);
    assert.deepEqual((await db.query(`SELECT * FROM "Expense" ORDER BY id`)).rows, beforeExpenses);
    assert.deepEqual((await db.query(`SELECT * FROM "Budget" ORDER BY id`)).rows, beforeBudgets);

    const inserted = (await db.query<{ publicId: string }>(`
      INSERT INTO "Spending" (name, "userId", "updatedAt") VALUES ('New group', 'owner', NOW())
      RETURNING "publicId"
    `)).rows[0];
    assert.match(inserted.publicId, uuidPattern);
    assert.ok(afterGroups.every(({ publicId }) => publicId !== inserted.publicId));

    await assert.rejects(db.query(`UPDATE "Spending" SET "publicId" = $1 WHERE id = 8`, [afterGroups[0].publicId]), /Spending_publicId_key/);
    await assert.rejects(db.exec(`UPDATE "Spending" SET "publicId" = NULL WHERE id = 7`), /null value/);
    await assert.rejects(db.exec(`UPDATE "Spending" SET "publicId" = '7' WHERE id = 7`), /invalid input syntax for type uuid/);
  } finally {
    await db.close();
  }
});
