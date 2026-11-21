import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const accountsMigration = "20261121100000_financial_accounts";
const originalProfileId = "11111111-1111-4111-8111-111111111111";
const otherProfileId = "22222222-2222-4222-8222-222222222222";
const newProfileId = "33333333-3333-4333-8333-333333333333";
const rolledBackProfileId = "44444444-4444-4444-8444-444444444444";

test("financial account migration links Pay Later profiles and preserves repayment history", async () => {
  const db = new PGlite();
  try {
    const directory = path.join(process.cwd(), "server/db/migrations");
    const earlierMigrations = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name < accountsMigration)
      .map((entry) => entry.name)
      .sort();
    for (const migration of earlierMigrations) {
      await db.exec(await readFile(path.join(directory, migration, "migration.sql"), "utf8"));
    }

    await db.exec(`
      INSERT INTO "user" (id, name, email, "updatedAt") VALUES
        ('owner', 'Owner', 'owner@example.test', NOW()),
        ('other', 'Other', 'other@example.test', NOW());
      INSERT INTO "Spending" (id, name, "userId", "updatedAt") VALUES (7, 'Household', 'owner', NOW());
      INSERT INTO "Category" (id, name, "spendingId") VALUES (11, 'Appliances', 7);
      INSERT INTO "Expense" (id, title, "amountCentavos", date, "categoryId", "expenseGroupId", "transactionType", "updatedAt")
        VALUES (21, 'Air fryer', 360000, '2026-11-17', 11, 7, 'PAY_LATER', NOW());
      INSERT INTO "PayLaterAccount" (id, "userId", name, key, enabled, "createdAt") VALUES
        ('${originalProfileId}', 'owner', 'SPayLater', 'spaylater', false, '2026-11-15'),
        ('${otherProfileId}', 'other', 'SPayLater', 'spaylater', true, '2026-11-16');
      INSERT INTO "CreditAccountAssignment" ("expenseGroupId", "creditAccountId", "userId")
        VALUES (7, '${originalProfileId}', 'owner');
      INSERT INTO "RepaymentPlan" (id, "expenseId", "creditAccountId")
        VALUES ('55555555-5555-4555-8555-555555555555', 21, '${originalProfileId}');
      INSERT INTO "LoanInstallment" (id, "planId", "dueDate", "amountCentavos")
        VALUES ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', '2026-12-05', 360000);
      INSERT INTO "LoanPayment" (id, "userId", "paidOn", "fundingAccount", "amountCentavos", "submissionId", "payloadHash")
        VALUES ('77777777-7777-4777-8777-777777777777', 'owner', '2026-11-20', 'GCash', 120000,
          '88888888-8888-4888-8888-888888888888', 'payment');
      INSERT INTO "LoanPaymentAllocation" ("paymentId", "installmentId", "amountCentavos")
        VALUES ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', 120000);
    `);
    const historyTables = ["PayLaterAccount", "CreditAccountAssignment", "Expense", "RepaymentPlan",
      "LoanInstallment", "LoanPayment", "LoanPaymentAllocation"];
    const history = () => Promise.all(historyTables.map(async (table) => (
      await db.query(`SELECT * FROM "${table}" ORDER BY 1`)
    ).rows));
    const originalHistory = await history();

    await db.exec(await readFile(path.join(directory, accountsMigration, "migration.sql"), "utf8"));
    assert.deepEqual(await history(), originalHistory);

    const linkedAccounts = () => db.query(`
      SELECT "payLaterAccountId", "userId", name, type, currency, active, "createdAt"::date::text AS "createdOn"
      FROM "FinancialAccount" ORDER BY "payLaterAccountId"
    `);
    const backfilledAccounts = (await linkedAccounts()).rows;
    assert.deepEqual(backfilledAccounts, [
      { payLaterAccountId: originalProfileId, userId: "owner", name: "SPayLater", type: "PAY_LATER", currency: "PHP", active: true, createdOn: "2026-11-15" },
      { payLaterAccountId: otherProfileId, userId: "other", name: "SPayLater", type: "PAY_LATER", currency: "PHP", active: true, createdOn: "2026-11-16" },
    ]);

    await db.exec(`
      INSERT INTO "PayLaterAccount" (id, "userId", name, key, "createdAt")
        VALUES ('${newProfileId}', 'owner', 'Another Pay Later account', 'another', '2026-11-20');
      INSERT INTO "PayLaterAccount" ("userId", name, key)
        VALUES ('owner', 'Retry', 'another') ON CONFLICT ("userId", key) DO NOTHING;
    `);
    await db.exec(`
      BEGIN;
      INSERT INTO "PayLaterAccount" (id, "userId", name, key)
        VALUES ('${rolledBackProfileId}', 'owner', 'Rolled back', 'rolled back');
      ROLLBACK;
    `);
    assert.deepEqual((await linkedAccounts()).rows, [
      ...backfilledAccounts,
      { payLaterAccountId: newProfileId, userId: "owner", name: "Another Pay Later account", type: "PAY_LATER", currency: "PHP", active: true, createdOn: "2026-11-20" },
    ]);

    await assert.rejects(db.exec(`
      INSERT INTO "FinancialAccount" ("userId", name, type, "payLaterAccountId", "updatedAt")
        VALUES ('other', 'Wrong owner', 'PAY_LATER', '${originalProfileId}', NOW());
    `), /FinancialAccount_payLaterAccountId_userId_fkey/);
    await assert.rejects(db.exec(`
      INSERT INTO "FinancialAccount" ("userId", name, type, "payLaterAccountId", "updatedAt")
        VALUES ('owner', 'Duplicate link', 'PAY_LATER', '${originalProfileId}', NOW());
    `), /FinancialAccount_payLaterAccountId_userId_key/);
    await assert.rejects(db.exec(`
      INSERT INTO "FinancialAccount" ("userId", name, type, "updatedAt")
        VALUES ('owner', 'Missing profile', 'PAY_LATER', NOW());
    `), /FinancialAccount_pay_later_profile/);
    await assert.rejects(db.exec(`
      INSERT INTO "FinancialAccount" ("userId", name, type, currency, "updatedAt")
        VALUES ('owner', 'Invalid currency', 'SAVINGS', 'php', NOW());
    `), /FinancialAccount_currency_code/);

    await db.exec(`
      CREATE ROLE account_api NOLOGIN;
      GRANT USAGE ON SCHEMA public TO account_api;
      GRANT SELECT, INSERT ON "FinancialAccount" TO account_api;
      SET ROLE account_api;
    `);
    assert.deepEqual((await linkedAccounts()).rows, []);
    await assert.rejects(db.exec(`
      INSERT INTO "FinancialAccount" ("userId", name, type, "updatedAt")
        VALUES ('other', 'Private account', 'SAVINGS', NOW());
    `), /row-level security/);
  } finally {
    await db.close();
  }
});
