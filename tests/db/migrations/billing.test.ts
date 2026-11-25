import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const billingMigration = "20261126010000_add_spaylater_billing";
const migrationsDirectory = path.join(process.cwd(), "server/db/migrations");

function readMigration(name: string) {
  return readFile(path.join(migrationsDirectory, name, "migration.sql"), "utf8");
}

test("billing migration preserves expense history and enforces bill dates, uniqueness, ownership, and RLS", async () => {
  const db = new PGlite();
  try {
    const migrations = (await readdir(migrationsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name < billingMigration)
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) await db.exec(await readMigration(migration));

    await db.exec(`
      INSERT INTO "user" (id, name, email, "updatedAt") VALUES
        ('owner', 'Owner', 'owner@example.test', NOW()),
        ('other', 'Other', 'other@example.test', NOW());
      INSERT INTO "Spending" (id, name, "userId", "updatedAt") VALUES
        (7, 'Household', 'owner', NOW()), (8, 'Private', 'other', NOW());
      INSERT INTO "Category" (id, name, "spendingId") VALUES (11, 'Shopping', 7), (12, 'Shopping', 8);
      INSERT INTO "Expense" (id, title, "amountCentavos", date, "categoryId", "expenseGroupId",
        "transactionType", "payLaterProviderKey", "updatedAt") VALUES
        (21, 'Existing purchase', 100000, '2026-06-26', 11, 7, 'PAY_LATER', 'shopee', NOW()),
        (22, 'Private purchase', 1000, '2026-06-26', 12, 8, 'PAY_LATER', 'shopee', NOW()),
        (23, 'Second household purchase', 300, '2026-06-26', 11, 7, 'PAY_LATER', 'shopee', NOW());
    `);

    const expenses = () => db.query(`
      SELECT id, title, "amountCentavos", date, "categoryId", "expenseGroupId",
        "transactionType", "payLaterProviderKey", "updatedAt" FROM "Expense" ORDER BY id
    `);
    const before = (await expenses()).rows;
    await db.exec(await readMigration(billingMigration));
    assert.deepEqual((await expenses()).rows, before);
    assert.deepEqual((await db.query('SELECT * FROM "Billing"')).rows, []);
    assert.deepEqual((await db.query('SELECT * FROM "BillingInstallment"')).rows, []);

    const addBill = (expenseGroupId: number, dueDay: number, dates: readonly string[]) => db.query<{ id: number }>(`
      INSERT INTO "Billing" ("expenseGroupId", "dueDay", "periodStart", "periodEnd", "statementDate", "dueDate")
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, [expenseGroupId, dueDay, ...dates]);
    const fifthCycle = ["2026-06-25", "2026-07-24", "2026-07-25", "2026-08-05"];
    const fifteenthCycle = ["2026-06-05", "2026-07-04", "2026-07-05", "2026-07-15"];
    const finalFifthCycle = ["2027-05-25", "2027-06-24", "2027-06-25", "2027-07-05"];
    const { id: fifthBillId } = (await addBill(7, 5, fifthCycle)).rows[0];
    await addBill(7, 15, fifteenthCycle);
    const { id: finalFifthBillId } = (await addBill(7, 5, finalFifthCycle)).rows[0];
    const { id: otherBillId } = (await addBill(8, 5, fifthCycle)).rows[0];

    await assert.rejects(addBill(7, 5, fifthCycle), { code: "23505" });
    await assert.rejects(addBill(7, 10, fifthCycle), { code: "23514" });
    await assert.rejects(addBill(7, 5, ["2026-06-24", ...fifthCycle.slice(1)]), { code: "23514" });
    await assert.rejects(addBill(7, 5, ["2026-06-25", "2026-07-23", "2026-07-25", "2026-08-05"]), { code: "23514" });
    await assert.rejects(addBill(7, 15, ["2026-06-05", "2026-07-03", "2026-07-04", "2026-07-15"]), { code: "23514" });
    await assert.rejects(addBill(7, 15, ["2026-06-05", "2026-07-04", "2026-07-05", "2026-08-15"]), { code: "23514" });

    const addInstallment = (billingId: number, expenseId: number, expenseGroupId: number, installmentNumber: number, amountCentavos: number) => db.query(`
      INSERT INTO "BillingInstallment" ("billingId", "expenseId", "expenseGroupId", "installmentNumber", "amountCentavos")
      VALUES ($1, $2, $3, $4, $5)
    `, [billingId, expenseId, expenseGroupId, installmentNumber, amountCentavos]);
    await addInstallment(fifthBillId, 21, 7, 1, 33_334);
    await addInstallment(finalFifthBillId, 21, 7, 12, 0);
    await addInstallment(fifthBillId, 23, 7, 1, 300);
    await assert.rejects(addInstallment(finalFifthBillId, 23, 7, 1, 300), { code: "23505" });
    await assert.rejects(addInstallment(fifthBillId, 21, 7, 2, 33_333), { code: "23505" });
    await assert.rejects(addInstallment(otherBillId, 21, 7, 2, 33_333), { code: "23503" });
    await assert.rejects(addInstallment(fifthBillId, 22, 7, 1, 300), { code: "23503" });
    await assert.rejects(addInstallment(fifthBillId, 21, 7, 0, 33_333), { code: "23514" });
    await assert.rejects(addInstallment(fifthBillId, 21, 7, 13, 33_333), { code: "23514" });
    await assert.rejects(addInstallment(fifthBillId, 21, 7, 2, -1), { code: "23514" });

    await db.exec(`
      CREATE ROLE billing_api NOLOGIN;
      GRANT USAGE ON SCHEMA public TO billing_api;
      GRANT SELECT, INSERT ON "Billing", "BillingInstallment" TO billing_api;
      GRANT USAGE ON SEQUENCE "Billing_id_seq", "BillingInstallment_id_seq" TO billing_api;
      SET ROLE billing_api;
    `);
    assert.deepEqual((await db.query('SELECT id FROM "Billing"')).rows, []);
    assert.deepEqual((await db.query('SELECT id FROM "BillingInstallment"')).rows, []);
    await assert.rejects(addBill(8, 15, fifteenthCycle), /row-level security/);
    await assert.rejects(addInstallment(otherBillId, 22, 8, 1, 1000), /row-level security/);

    await db.exec('RESET ROLE; DELETE FROM "Expense" WHERE id = 21');
    assert.deepEqual((await db.query('SELECT "expenseId" FROM "BillingInstallment"')).rows, [{ expenseId: 23 }]);
    await db.query('DELETE FROM "Billing" WHERE id = $1', [fifthBillId]);
    assert.deepEqual((await db.query('SELECT id FROM "BillingInstallment"')).rows, []);
    await db.exec('DELETE FROM "Expense" WHERE id = 22; DELETE FROM "Category" WHERE id = 12; DELETE FROM "Spending" WHERE id = 8');
    assert.deepEqual((await db.query('SELECT id FROM "Billing" WHERE "expenseGroupId" = 8')).rows, []);
  } finally {
    await db.close();
  }
});
