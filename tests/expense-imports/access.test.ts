import { createTestDatabase } from "../helpers/database";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createExpenseImportAccess } from "../../app/(dashboard)/_lib/expense-imports/access";
import { MAX_IMPORT_ROWS } from "../../app/lib/expenses/import";

test("expense imports check ownership, report matches, and save atomically", async (t) => {
  const fixture = await createTestDatabase();
  const { client } = fixture;

  try {

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

    await t.test("merchants persist without cross-linking otherwise identical imported rows", async () => {
      const rows = [" Café 日本 ", "Other café"].map((merchant, index) => ({
        ...draft, title: "Merchant import", merchant, rowNumber: index + 2, submissionId: randomUUID(),
      }));
      assert.equal(await imports.save(aliceGroup.id, category.id, rows), 2);
      assert.equal(await imports.save(aliceGroup.id, category.id, [...rows].reverse()), 2);
      for (const row of rows) {
        const submission = await client.expenseSubmission.findUniqueOrThrow({
          where: { expenseGroupId_id: { expenseGroupId: aliceGroup.id, id: row.submissionId } }, include: { expense: true },
        });
        assert.equal(submission.expense?.merchant, row.merchant.trim());
      }
      await assert.rejects(imports.save(aliceGroup.id, category.id, [{ ...rows[0], merchant: "Changed" }]), /different details/);
      const invalid = ["x".repeat(101), "bad\0name", 123];
      for (const merchant of invalid) {
        await assert.rejects(imports.save(aliceGroup.id, category.id, [{ ...rows[0], submissionId: randomUUID(), merchant }]), /Row 2/);
      }
      assert.equal(await client.expense.count({ where: { title: "Merchant import" } }), 2);
    });

    await t.test("named merchant duplicate checks distinguish merchants and preserve old unmapped warnings", async () => {
      const row = { ...draft, title: "Merchant import", rowNumber: 2, submissionId: randomUUID() };
      assert.deepEqual(await imports.preview(aliceGroup.id, [{ ...row, merchant: " café 日本 " }]), [2]);
      assert.deepEqual(await imports.preview(aliceGroup.id, [{ ...row, merchant: "Different" }]), []);
      assert.deepEqual(await imports.preview(aliceGroup.id, [row]), [2]);
      assert.deepEqual(await imports.preview(aliceGroup.id, [{ ...row, merchant: "  " }]), [2]);
      const bobImports = createExpenseImportAccess(client, async () => "bob");
      assert.deepEqual(await bobImports.preview(bobGroup.id, [{ ...row, merchant: "café 日本" }]), []);
    });

    await t.test("pre-merchant draft hashes remain retryable for absent or blank merchants", async () => {
      const row = { ...draft, title: "Old import", rowNumber: 2, submissionId: randomUUID() };
      const expense = await client.expense.create({ data: {
        title: row.title, amountCentavos: 15075, date: new Date(row.date), categoryId: category.id, expenseGroupId: aliceGroup.id,
      } });
      const payloadHash = createHash("sha256")
        .update(JSON.stringify(["expense-import", category.id, JSON.stringify([row.title, 15075, row.date])])).digest("hex");
      await client.expenseSubmission.create({ data: { id: row.submissionId, expenseGroupId: aliceGroup.id, expenseId: expense.id, payloadHash } });
      assert.equal(await imports.save(aliceGroup.id, category.id, [row]), 1);
      assert.equal(await imports.save(aliceGroup.id, category.id, [{ ...row, merchant: " " }]), 1);
      assert.equal(await client.expense.count({ where: { title: row.title } }), 1);
      await assert.rejects(imports.save(aliceGroup.id, category.id, [{ ...row, merchant: "New merchant" }]), /different details/);
    });
  } finally {
    await fixture.close();
  }
});
