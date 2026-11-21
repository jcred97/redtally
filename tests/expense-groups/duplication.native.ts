import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../../generated/prisma/client";
import { createExpenseGroupAccess } from "../../app/(dashboard)/_lib/expense-groups/access";
import { createNativeTestDatabase } from "../helpers/native-database";

test("native PostgreSQL duplicates 50,000 expenses exactly and rolls back a failed copy", async (t) => {
  const { client, close } = await createNativeTestDatabase();
  try {
    await client.user.createMany({ data: [
      { id: "owner", name: "Owner", email: "owner@example.test" },
      { id: "other", name: "Other", email: "other@example.test" },
    ] });
    const owner = createExpenseGroupAccess(client, async () => "owner");
    const other = createExpenseGroupAccess(client, async () => "other");
    const anonymous = createExpenseGroupAccess(client, async () => { throw new Error("Sign in required"); });
    const source = await owner.create("Large history");
    const unclaimed = await client.expenseGroup.create({ data: { name: "Unclaimed" } });
    const categories = await client.category.createManyAndReturn({ data: [
      { expenseGroupId: source.id, name: "Same name", icon: "✈️", color: "#123abc" },
      { expenseGroupId: source.id, name: "Same name", icon: "🍱", color: "#abcdef" },
      { expenseGroupId: source.id, name: "Empty category" },
    ] });
    categories.sort((a, b) => a.id - b.id);
    const banks = await client.bank.createManyAndReturn({ data: [
      { name: "Historical inactive bank", key: "historical inactive bank", active: false },
      { name: "Current bank", key: "current bank" },
    ] });
    banks.sort((a, b) => a.id - b.id);
    const assignments = await client.bankAssignment.createManyAndReturn({ data: [
      {
        expenseGroupId: source.id, bankId: banks[0].id, active: false,
        supportedDebitCard: false, supportedCreditCard: true,
        supportedBankTransfer: false, supportedBankPayment: false,
      },
      { expenseGroupId: source.id, bankId: banks[1].id, supportedCreditCard: false },
    ] });
    assignments.sort((a, b) => a.id - b.id);
    await client.budget.createMany({ data: [
      { expenseGroupId: source.id, budgetMonth: new Date("2026-10-01"), amountCentavos: 2147483647, description: "Exact maximum" },
      { expenseGroupId: source.id, budgetMonth: new Date("2026-11-01"), amountCentavos: 12345 },
    ] });
    await client.$executeRaw`
      INSERT INTO "Expense" (title, merchant, "amountCentavos", date, "timeMinutes", notes,
        bank, "transactionType", "categoryId", "expenseGroupId", "bankAssignmentId", "updatedAt")
      SELECT 'Expense ' || n, CASE WHEN n % 2 = 0 THEN 'Merchant ' || n ELSE NULL END,
        CASE WHEN n % 7 = 0 THEN 2147483647 ELSE n * 7 END,
        timestamp '2026-11-18 12:34:56.789' - n * interval '1 day',
        CASE n % 5 WHEN 0 THEN NULL WHEN 1 THEN 0 WHEN 2 THEN 1439 ELSE n % 1440 END,
        CASE WHEN n % 2 = 0 THEN 'Notes: café / 日本語 ' || n ELSE NULL END,
        CASE WHEN n % 6 = 1 THEN 'Legacy bank label' ELSE NULL END,
        CASE n % 4 WHEN 0 THEN NULL WHEN 1 THEN 'CASH'::"TransactionType"
          WHEN 2 THEN 'BANK_PAYMENT'::"TransactionType" ELSE 'CREDIT_CARD'::"TransactionType" END,
        CASE WHEN n % 2 = 0 THEN ${categories[0].id}::int ELSE ${categories[1].id}::int END,
        ${source.id}, CASE n % 3 WHEN 0 THEN ${assignments[0].id}::int WHEN 1 THEN NULL ELSE ${assignments[1].id}::int END,
        now()
      FROM generate_series(1, 50000) AS n
    `;
    const recordedExpense = await client.expense.findFirstOrThrow({ where: { expenseGroupId: source.id } });
    await client.expenseSubmission.create({ data: {
      id: "b4730d36-89ae-4a8f-97d3-60b01dc31101", expenseGroupId: source.id,
      expenseId: recordedExpense.id, payloadHash: "source-submission",
    } });
    const recurring = await client.recurringExpense.create({ data: {
      expenseGroupId: source.id, categoryId: categories[0].id, bankAssignmentId: assignments[0].id,
      title: "Original recurring rule", amountCentavos: 100, paymentMethod: "CREDIT_CARD",
      frequency: "MONTHLY", startDate: new Date("2026-11-01"), nextDueDate: new Date("2026-12-01"),
      occurrences: { create: { dueDate: new Date("2026-11-01"), expenseId: recordedExpense.id } },
    } });

    const snapshot = () => client.$queryRaw`
      SELECT count(*)::int AS count, sum("amountCentavos") AS total,
        md5(string_agg(md5(row_to_json(e)::text), '' ORDER BY e.id)) AS checksum
      FROM "Expense" e WHERE "expenseGroupId" = ${source.id}
    `;
    const originalExpenses = await snapshot();
    const sourceMetadata = () => client.expenseGroup.findUniqueOrThrow({
      where: { id: source.id },
      include: {
        categories: { orderBy: { id: "asc" } },
        bankAssignments: { orderBy: { id: "asc" } },
        budgets: { orderBy: { id: "asc" } },
        expenseSubmissions: true,
        recurringExpenses: { include: { occurrences: true } },
      },
    });
    const originalMetadata = await sourceMetadata();
    const counts = async () => ({
      groups: await client.expenseGroup.count(), categories: await client.category.count(),
      expenses: await client.expense.count(), assignments: await client.bankAssignment.count(),
      budgets: await client.budget.count(), submissions: await client.expenseSubmission.count(),
      rules: await client.recurringExpense.count(), occurrences: await client.recurringExpenseOccurrence.count(),
    });

    await t.test("unauthorized calls cannot create any copy", async () => {
      const before = await counts();
      await assert.rejects(other.duplicate(source.id), /Expense group not found/);
      await assert.rejects(owner.duplicate(unclaimed.id), /Expense group not found/);
      await assert.rejects(owner.duplicate(2147483647), /Expense group not found/);
      await assert.rejects(anonymous.duplicate(source.id), /Sign in required/);
      assert.deepEqual(await counts(), before);
    });

    await t.test("the copy preserves every expense field and remaps categories and banks", async () => {
      // Prisma stores UTC wall-clock timestamps even when PostgreSQL's session uses another zone.
      await client.$executeRawUnsafe("SET TIME ZONE 'Asia/Manila'");
      const startedAt = Date.now();
      const copy = await owner.duplicate(source.id);
      const finishedAt = Date.now();
      assert.notEqual(copy.id, source.id);
      assert.notEqual(copy.publicId, source.publicId);
      const group = await client.expenseGroup.findUniqueOrThrow({ where: { id: copy.id } });
      assert.equal(group.name, "Large history (copy)");
      assert.equal(group.userId, "owner");
      assert.equal(await other.getById(copy.id), null);
      assert.equal(await client.expense.count({ where: { expenseGroupId: copy.id } }), 50000);
      const timestamps = await client.expense.aggregate({
        where: { expenseGroupId: copy.id },
        _min: { createdAt: true, updatedAt: true },
        _max: { createdAt: true, updatedAt: true },
      });
      for (const timestamp of [...Object.values(timestamps._min), ...Object.values(timestamps._max)]) {
        assert.ok(timestamp);
        assert.ok(timestamp.getTime() >= startedAt && timestamp.getTime() <= finishedAt,
          "Copied expense timestamps must use the actual UTC operation time");
      }

      const normalizedExpenses = (groupId: number) => Prisma.sql`
        SELECT e.title, e.merchant, e."amountCentavos", e.date, e."timeMinutes", e.notes,
          e.bank, e."transactionType", c.name, c.icon, c.color, b."bankId"
        FROM "Expense" e JOIN "Category" c ON c.id = e."categoryId"
        LEFT JOIN "BankAssignment" b ON b.id = e."bankAssignmentId"
        WHERE e."expenseGroupId" = ${groupId}
      `;
      const difference = await client.$queryRaw<{ count: number }[]>(Prisma.sql`
        WITH source AS (${normalizedExpenses(source.id)}), copy AS (${normalizedExpenses(copy.id)})
        SELECT count(*)::int AS count FROM (
          (SELECT * FROM source EXCEPT ALL SELECT * FROM copy)
          UNION ALL (SELECT * FROM copy EXCEPT ALL SELECT * FROM source)
        ) differences
      `);
      assert.equal(difference[0].count, 0);

      const copiedCategories = await client.category.findMany({ where: { expenseGroupId: copy.id }, orderBy: { id: "asc" } });
      assert.equal(copiedCategories.length, categories.length);
      for (const category of categories) {
        const copied = copiedCategories.find((row) => row.icon === category.icon);
        assert.ok(copied);
        assert.notEqual(copied.id, category.id);
        assert.deepEqual([copied.name, copied.icon, copied.color], [category.name, category.icon, category.color]);
      }
      const assignmentFields = {
        bankId: true, active: true, supportedDebitCard: true, supportedCreditCard: true,
        supportedBankTransfer: true, supportedBankPayment: true,
      } as const;
      assert.deepEqual(
        await client.bankAssignment.findMany({ where: { expenseGroupId: copy.id }, select: assignmentFields, orderBy: { bankId: "asc" } }),
        await client.bankAssignment.findMany({ where: { expenseGroupId: source.id }, select: assignmentFields, orderBy: { bankId: "asc" } }),
      );
      const budgetFields = { budgetMonth: true, amountCentavos: true, description: true } as const;
      assert.deepEqual(
        await client.budget.findMany({ where: { expenseGroupId: copy.id }, select: budgetFields, orderBy: { budgetMonth: "asc" } }),
        await client.budget.findMany({ where: { expenseGroupId: source.id }, select: budgetFields, orderBy: { budgetMonth: "asc" } }),
      );
      assert.equal(await client.expenseSubmission.count({ where: { expenseGroupId: copy.id } }), 0);
      assert.equal(await client.recurringExpense.count({ where: { expenseGroupId: copy.id } }), 0);
      assert.equal(await client.recurringExpenseOccurrence.count(), 1);
      assert.equal((await client.recurringExpenseOccurrence.findFirstOrThrow()).recurringExpenseId, recurring.id);
      assert.deepEqual(await snapshot(), originalExpenses);
      assert.deepEqual(await sourceMetadata(), originalMetadata);
    });

    await t.test("an expense insert failure rolls back the entire new group", async () => {
      const before = await counts();
      // Fail while copying a row in the populated category, after metadata is created.
      await client.$executeRawUnsafe(`
        CREATE FUNCTION reject_copied_expense() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."expenseGroupId" <> ${source.id} AND NEW.title = 'Expense 45001' THEN
            RAISE EXCEPTION 'forced duplication rollback';
          END IF;
          RETURN NEW;
        END $$
      `);
      await client.$executeRawUnsafe(`
        CREATE TRIGGER reject_copied_expense BEFORE INSERT ON "Expense"
        FOR EACH ROW EXECUTE FUNCTION reject_copied_expense()
      `);
      try {
        await assert.rejects(owner.duplicate(source.id), /forced duplication rollback/);
        assert.deepEqual(await counts(), before);
        assert.deepEqual(await snapshot(), originalExpenses);
        assert.deepEqual(await sourceMetadata(), originalMetadata);
      } finally {
        await client.$executeRawUnsafe('DROP TRIGGER reject_copied_expense ON "Expense"');
        await client.$executeRawUnsafe("DROP FUNCTION reject_copied_expense()");
      }
    });
  } finally {
    await close();
  }
});
