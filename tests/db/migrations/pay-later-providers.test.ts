import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const providerMigration = "20261121110000_pay_later_providers";
const cleanupMigration = "20261121120000_remove_accounts_and_loans";
const renameMigration = "20261121130000_rename_pay_later_provider_assignment";
const productSettingsMigration = "20261122020000_pay_later_product_settings";
const spayLaterId = "11111111-1111-4111-8111-111111111111";
const shopeeId = "22222222-2222-4222-8222-222222222222";
const customId = "33333333-3333-4333-8333-333333333333";

test("Pay Later provider assignments survive account cleanup, the rename, and the product setting", async () => {
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
        VALUES (21, 'Existing purchase', 360000, '2026-11-17', 11, 7, 'PAY_LATER', NOW()),
          (22, 'Existing custom purchase', 10000, '2026-11-18', 11, 7, 'PAY_LATER', NOW()),
          (23, 'Purchase without a plan', 10000, '2026-11-19', 11, 7, 'PAY_LATER', NOW()),
          (24, 'Cash purchase', 5000, '2026-11-19', 11, 7, 'CASH', NOW());
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
        VALUES ('55555555-5555-4555-8555-555555555555', 21, '${spayLaterId}'),
          ('66666666-6666-4666-8666-666666666666', 22, '${customId}');
      INSERT INTO "FinancialAccount" ("userId", name, type, "updatedAt")
        VALUES ('owner', 'Savings', 'SAVINGS', NOW());
      INSERT INTO "Loan" (id, "userId", "expenseGroupId", title, lender, "amountCentavos", "disbursementDate",
        "receivingAccount", "submissionId", "payloadHash")
        VALUES ('77777777-7777-4777-8777-777777777777', 'owner', 7, 'Cash loan', 'Lender', 12000, '2026-11-19',
          'Checking', gen_random_uuid(), 'cash');
      WITH installment AS (
        INSERT INTO "LoanInstallment" ("planId", "loanId", "dueDate", "amountCentavos")
        VALUES ('55555555-5555-4555-8555-555555555555', NULL, '2026-12-17', 360000),
          (NULL, '77777777-7777-4777-8777-777777777777', '2026-12-05', 12000) RETURNING id
      ), payment AS (
        INSERT INTO "LoanPayment" ("userId", "paidOn", "fundingAccount", "amountCentavos", "submissionId", "payloadHash")
        VALUES ('owner', '2026-11-20', 'Checking', 20000, gen_random_uuid(), 'historic') RETURNING id
      )
      INSERT INTO "LoanPaymentAllocation" ("installmentId", "paymentId", "amountCentavos")
        SELECT installment.id, payment.id, 10000 FROM installment CROSS JOIN payment;
    `);
    const financialAccounts = () => db.query('SELECT * FROM "FinancialAccount" ORDER BY id');
    const plans = () => db.query<Record<string, unknown>>('SELECT * FROM "RepaymentPlan" ORDER BY id');
    const beforeAccounts = (await financialAccounts()).rows;
    const beforePlans = (await plans()).rows;
    const beforeExpenses = (await db.query<Record<string, unknown>>('SELECT * FROM "Expense" ORDER BY id')).rows;

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
    const expectedAssignments = [
      { expenseGroupId: 7, providerKey: "custom:neighborhood store", providerName: "Neighborhood Store", active: true },
      { expenseGroupId: 7, providerKey: "shopee", providerName: null, active: true },
      { expenseGroupId: 8, providerKey: "custom:neighborhood store", providerName: "Neighborhood Store", active: false },
      { expenseGroupId: 8, providerKey: "shopee", providerName: null, active: false },
      { expenseGroupId: 9, providerKey: "custom:neighborhood store", providerName: "Neighborhood Store", active: true },
      { expenseGroupId: 9, providerKey: "shopee", providerName: null, active: true },
    ];
    assert.deepEqual((await assignments()).rows, expectedAssignments);
    await assert.rejects(db.exec(`
      INSERT INTO "ExpenseGroupPayLaterProvider" ("expenseGroupId", "userId", "providerKey")
        VALUES (10, 'owner', 'shopee')
    `), /ExpenseGroupPayLaterProvider_expenseGroupId_userId_fkey/);

    await db.exec(await readFile(path.join(directory, cleanupMigration, "migration.sql"), "utf8"));
    assert.deepEqual((await assignments()).rows, expectedAssignments);
    const savedExpenses = (await db.query('SELECT * FROM "Expense" ORDER BY id')).rows;
    assert.deepEqual(savedExpenses, [
      { ...beforeExpenses[0], payLaterProviderKey: "shopee", payLaterProviderName: null },
      { ...beforeExpenses[1], payLaterProviderKey: "custom:neighborhood store", payLaterProviderName: "Neighborhood Store" },
      { ...beforeExpenses[2], payLaterProviderKey: null, payLaterProviderName: null },
      { ...beforeExpenses[3], payLaterProviderKey: null, payLaterProviderName: null },
    ]);
    for (const table of ["FinancialAccount", "PayLaterAccount", "CreditAccountAssignment", "RepaymentPlan",
      "Loan", "LoanInstallment", "LoanPayment", "LoanPaymentAllocation"]) {
      await assert.rejects(db.query(`SELECT * FROM "${table}"`), /relation.*does not exist/);
    }
    assert.deepEqual((await db.query(`
      SELECT
        to_regprocedure('public.create_pay_later_financial_account()') AS "accountTriggerFunction",
        to_regtype('"FinancialAccountType"') AS "financialAccountType"
    `)).rows, [{ accountTriggerFunction: null, financialAccountType: null }]);
    await db.exec(`
      CREATE ROLE provider_api NOLOGIN;
      GRANT USAGE ON SCHEMA public TO provider_api;
      GRANT SELECT, INSERT ON "ExpenseGroupPayLaterProvider" TO provider_api;
    `);
    const savedAssignments = (await db.query<Record<string, unknown>>('SELECT * FROM "ExpenseGroupPayLaterProvider" ORDER BY "expenseGroupId", "providerKey"')).rows;
    await db.exec(await readFile(path.join(directory, renameMigration, "migration.sql"), "utf8"));

    const renamedAssignments = () => db.query('SELECT * FROM "PayLaterProviderAssignment" ORDER BY "expenseGroupId", "providerKey"');
    assert.deepEqual((await renamedAssignments()).rows, savedAssignments);
    assert.deepEqual((await db.query('SELECT * FROM "Expense" ORDER BY id')).rows, savedExpenses);
    assert.deepEqual((await db.query(`SELECT to_regclass('"ExpenseGroupPayLaterProvider"') AS "oldTable"`)).rows, [{ oldTable: null }]);
    await assert.rejects(db.exec(`
      INSERT INTO "PayLaterProviderAssignment" ("expenseGroupId", "userId", "providerKey")
        VALUES (10, 'owner', 'shopee')
    `), /PayLaterProviderAssignment_expenseGroupId_userId_fkey/);
    await assert.rejects(db.exec(`
      INSERT INTO "PayLaterProviderAssignment" ("expenseGroupId", "userId", "providerKey")
        VALUES (7, 'owner', 'shopee')
    `), /PayLaterProviderAssignment_pkey/);

    await db.exec(await readFile(path.join(directory, productSettingsMigration, "migration.sql"), "utf8"));
    assert.deepEqual((await renamedAssignments()).rows, savedAssignments.map((assignment) => ({ ...assignment, productEnabled: true })));
    assert.deepEqual((await db.query('SELECT * FROM "Expense" ORDER BY id')).rows, savedExpenses);
    await db.exec(`
      UPDATE "PayLaterProviderAssignment" SET "productEnabled" = false
      WHERE "expenseGroupId" = 7 AND "providerKey" = 'shopee'
    `);
    assert.deepEqual((await db.query(`
      SELECT active, "productEnabled" FROM "PayLaterProviderAssignment"
      WHERE "expenseGroupId" = 7 AND "providerKey" = 'shopee'
    `)).rows, [{ active: true, productEnabled: false }]);

    await db.exec("SET ROLE provider_api");
    assert.deepEqual((await renamedAssignments()).rows, []);
    await assert.rejects(db.exec(`
      INSERT INTO "PayLaterProviderAssignment" ("expenseGroupId", "userId", "providerKey")
        VALUES (7, 'owner', 'lazada')
    `), /row-level security/);
  } finally {
    await db.close();
  }
});
