import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const providerMigration = "20261121110000_pay_later_providers";
const spayLaterId = "11111111-1111-4111-8111-111111111111";
const shopeeId = "22222222-2222-4222-8222-222222222222";
const customId = "33333333-3333-4333-8333-333333333333";

test("provider migration separates group settings from financial accounts and preserves repayment links", async () => {
  const db = new PGlite();
  try {
    const directory = path.join(process.cwd(), "server/db/migrations");
    const migrations = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name < providerMigration)
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) {
      await db.exec(await readFile(path.join(directory, migration, "migration.sql"), "utf8"));
    }
    await db.exec(`
      INSERT INTO "user" (id, name, email, "updatedAt") VALUES
        ('owner', 'Owner', 'owner@example.test', NOW()),
        ('other', 'Other', 'other@example.test', NOW());
      INSERT INTO "Spending" (id, name, "userId", "updatedAt") VALUES
        (7, 'Household', 'owner', NOW()),
        (8, 'Work', 'owner', NOW()),
        (9, 'Travel', 'owner', NOW()),
        (10, 'Private', 'other', NOW());
      INSERT INTO "Category" (id, name, "spendingId") VALUES (11, 'Shopping', 7);
      INSERT INTO "Expense" (id, title, "amountCentavos", date, "categoryId", "expenseGroupId", "transactionType", "updatedAt")
        VALUES (21, 'Existing purchase', 360000, '2026-11-17', 11, 7, 'PAY_LATER', NOW());
      INSERT INTO "PayLaterAccount" (id, "userId", name, key, enabled) VALUES
        ('${spayLaterId}', 'owner', 'SPayLater', 'spaylater', true),
        ('${shopeeId}', 'owner', 'Shopee', 'shopee', false),
        ('${customId}', 'owner', 'Neighborhood Store', 'neighborhood store', true);
      INSERT INTO "CreditAccountAssignment" ("expenseGroupId", "creditAccountId", "userId", active) VALUES
        (7, '${spayLaterId}', 'owner', false),
        (7, '${shopeeId}', 'owner', true),
        (8, '${spayLaterId}', 'owner', false),
        (8, '${customId}', 'owner', false);
      INSERT INTO "RepaymentPlan" (id, "expenseId", "creditAccountId")
        VALUES ('55555555-5555-4555-8555-555555555555', 21, '${spayLaterId}');
    `);
    const financialAccounts = () => db.query('SELECT * FROM "FinancialAccount" ORDER BY id');
    const plans = () => db.query('SELECT * FROM "RepaymentPlan" ORDER BY id');
    const beforeAccounts = (await financialAccounts()).rows;
    const beforePlans = (await plans()).rows;

    await db.exec(await readFile(path.join(directory, providerMigration, "migration.sql"), "utf8"));

    assert.deepEqual((await financialAccounts()).rows, beforeAccounts);
    assert.deepEqual((await plans()).rows, beforePlans);
    assert.deepEqual((await db.query(`
      SELECT id, "providerKey", "providerName" FROM "PayLaterAccount" ORDER BY id
    `)).rows, [
      { id: spayLaterId, providerKey: "shopee", providerName: null },
      { id: shopeeId, providerKey: "shopee", providerName: null },
      { id: customId, providerKey: "custom:neighborhood store", providerName: "Neighborhood Store" },
    ]);
    const assignments = () => db.query(`
      SELECT "expenseGroupId", "providerKey", "providerName", active
      FROM "ExpenseGroupPayLaterProvider" ORDER BY "expenseGroupId", "providerKey"
    `);
    assert.deepEqual((await assignments()).rows, [
      { expenseGroupId: 7, providerKey: "custom:neighborhood store", providerName: "Neighborhood Store", active: true },
      { expenseGroupId: 7, providerKey: "shopee", providerName: null, active: true },
      { expenseGroupId: 8, providerKey: "custom:neighborhood store", providerName: "Neighborhood Store", active: false },
      { expenseGroupId: 8, providerKey: "shopee", providerName: null, active: false },
      { expenseGroupId: 9, providerKey: "custom:neighborhood store", providerName: "Neighborhood Store", active: true },
      { expenseGroupId: 9, providerKey: "shopee", providerName: null, active: true },
    ]);
    await assert.rejects(db.exec(`
      INSERT INTO "ExpenseGroupPayLaterProvider" ("expenseGroupId", "userId", "providerKey")
        VALUES (10, 'owner', 'shopee')
    `), /ExpenseGroupPayLaterProvider_expenseGroupId_userId_fkey/);
    await db.exec(`
      CREATE ROLE provider_api NOLOGIN;
      GRANT USAGE ON SCHEMA public TO provider_api;
      GRANT SELECT, INSERT ON "ExpenseGroupPayLaterProvider" TO provider_api;
      SET ROLE provider_api;
    `);
    assert.deepEqual((await assignments()).rows, []);
    await assert.rejects(db.exec(`
      INSERT INTO "ExpenseGroupPayLaterProvider" ("expenseGroupId", "userId", "providerKey")
        VALUES (7, 'owner', 'lazada')
    `), /row-level security/);
  } finally {
    await db.close();
  }
});
