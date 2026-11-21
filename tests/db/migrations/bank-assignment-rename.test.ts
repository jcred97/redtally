import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const renameMigration = "20261122010000_rename_bank_assignment";
const migrationsDirectory = path.join(process.cwd(), "server/db/migrations");

function readMigration(name: string) {
  return readFile(path.join(migrationsDirectory, name, "migration.sql"), "utf8");
}

test("the BankAssignment rename preserves settings, expense links, and database protections", async () => {
  const db = new PGlite();
  try {
    const migrations = (await readdir(migrationsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name < renameMigration)
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) await db.exec(await readMigration(migration));

    await db.exec(`
      INSERT INTO "user" (id, name, email, "updatedAt") VALUES ('owner', 'Owner', 'owner@example.test', NOW());
      INSERT INTO "Spending" (id, name, "userId", "updatedAt") VALUES
        (7, 'Household', 'owner', NOW()), (8, 'Work', 'owner', NOW()), (9, 'Travel', 'owner', NOW());
      INSERT INTO "Category" (id, name, "spendingId") VALUES (11, 'Food', 7), (12, 'Bills', 8);
      INSERT INTO "Bank" (id, name, key, "updatedAt") VALUES
        (901, 'Migration Test Bank', 'migration test bank', NOW()),
        (902, 'Another Test Bank', 'another test bank', NOW());
      INSERT INTO "ExpenseGroupBank" ("expenseGroupId", "bankId", active, "supportedDebitCard", "supportedCreditCard",
        "supportedBankTransfer", "supportedBankPayment", "updatedAt") VALUES
        (7, 901, true, true, false, true, false, NOW()),
        (8, 901, false, false, true, false, true, NOW());
      INSERT INTO "Expense" (id, title, "amountCentavos", date, "categoryId", "expenseGroupId", "bankAssignmentId", bank,
        "transactionType", "updatedAt") VALUES
        (21, 'Linked expense', 12000, '2026-11-15', 11, 7,
          (SELECT id FROM "ExpenseGroupBank" WHERE "expenseGroupId" = 7), NULL, 'DEBIT_CARD', NOW()),
        (22, 'Disabled provider expense', 5000, '2026-11-15', 12, 8,
          (SELECT id FROM "ExpenseGroupBank" WHERE "expenseGroupId" = 8), NULL, 'CREDIT_CARD', NOW()),
        (23, 'Legacy bank expense', 1000, '2026-11-15', 11, 7, NULL, '  Original bank label  ', 'BANK_PAYMENT', NOW());
      INSERT INTO "RecurringExpense" (id, title, "amountCentavos", "startDate", "nextDueDate", frequency,
        "categoryId", "expenseGroupId", "bankAssignmentId", "paymentMethod", "updatedAt") VALUES
        (31, 'Linked schedule', 15000, '2026-11-15', '2026-12-15', 'MONTHLY', 11, 7,
          (SELECT id FROM "ExpenseGroupBank" WHERE "expenseGroupId" = 7), 'BANK_TRANSFER', NOW());
      CREATE ROLE bank_assignment_api NOLOGIN;
      GRANT USAGE ON SCHEMA public TO bank_assignment_api;
      GRANT SELECT, INSERT ON "ExpenseGroupBank" TO bank_assignment_api;
    `);

    const tableMetadata = (name: string) => db.query(
      'SELECT oid::text AS oid, relrowsecurity AS rls, relacl::text AS grants FROM pg_class WHERE oid = to_regclass($1)',
      [name],
    );
    const settings = (await db.query<{ id: number }>('SELECT * FROM "ExpenseGroupBank" ORDER BY id')).rows;
    const expenses = (await db.query('SELECT * FROM "Expense" ORDER BY id')).rows;
    const recurring = (await db.query('SELECT * FROM "RecurringExpense" ORDER BY id')).rows;
    const metadata = (await tableMetadata('public."ExpenseGroupBank"')).rows;

    await db.exec(await readMigration(renameMigration));

    assert.deepEqual((await db.query('SELECT * FROM "BankAssignment" ORDER BY id')).rows, settings);
    assert.deepEqual((await db.query('SELECT * FROM "Expense" ORDER BY id')).rows, expenses);
    assert.deepEqual((await db.query('SELECT * FROM "RecurringExpense" ORDER BY id')).rows, recurring);
    assert.deepEqual((await tableMetadata('public."BankAssignment"')).rows, metadata);
    assert.deepEqual((await tableMetadata('public."ExpenseGroupBank"')).rows, []);
    assert.deepEqual((await db.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'BankAssignment' ORDER BY indexname
    `)).rows.map(({ indexname }) => indexname), [
      "BankAssignment_bankId_idx", "BankAssignment_expenseGroupId_bankId_key", "BankAssignment_id_expenseGroupId_key", "BankAssignment_pkey",
    ]);
    assert.deepEqual((await db.query(`SELECT pg_get_serial_sequence('public."BankAssignment"', 'id') AS sequence`)).rows,
      [{ sequence: 'public."BankAssignment_id_seq"' }]);
    const next = (await db.query<{ id: number }>(`
      INSERT INTO "BankAssignment" ("expenseGroupId", "bankId", "updatedAt") VALUES (9, 901, NOW()) RETURNING id
    `)).rows[0];
    assert.equal(next.id, settings[1].id + 1);

    await assert.rejects(db.exec(`
      UPDATE "Expense" SET "bankAssignmentId" = ${settings[1].id} WHERE id = 21
    `), /Expense_bankAssignmentId_expenseGroupId_fkey/);
    await assert.rejects(db.exec(`
      UPDATE "RecurringExpense" SET "bankAssignmentId" = ${settings[1].id} WHERE id = 31
    `), /RecurringExpense_bankAssignmentId_expenseGroupId_fkey/);
    await assert.rejects(db.exec(`
      INSERT INTO "BankAssignment" ("expenseGroupId", "bankId", "updatedAt") VALUES (999, 901, NOW())
    `), /BankAssignment_expenseGroupId_fkey/);
    await assert.rejects(db.exec(`
      INSERT INTO "BankAssignment" ("expenseGroupId", "bankId", "updatedAt") VALUES (7, 999, NOW())
    `), /BankAssignment_bankId_fkey/);

    await db.exec("SET ROLE bank_assignment_api");
    assert.deepEqual((await db.query('SELECT * FROM "BankAssignment"')).rows, []);
    await assert.rejects(db.exec(`
      INSERT INTO "BankAssignment" (id, "expenseGroupId", "bankId", "updatedAt") VALUES (9000, 9, 902, NOW())
    `), /row-level security/);
  } finally {
    await db.close();
  }
});
