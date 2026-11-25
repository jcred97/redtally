import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createExpenseAccess } from "../../app/(dashboard)/_lib/expenses/access";
import { createTestDatabase } from "../helpers/database";

const purchase = {
  title: "SPayLater purchase", amount: "1000.00", date: "2026-06-26",
  paymentMethod: "PAY_LATER", payLaterProviderKey: "shopee",
};
const threeInstallments = { ...purchase, spayLaterDueDay: "5", spayLaterMonths: "3" };

test("expense writes keep SPayLater installments, bills, and retries consistent", async () => {
  const fixture = await createTestDatabase();
  const { client, db } = fixture;
  try {
    await client.user.createMany({ data: [
      { id: "owner", name: "Owner", email: "owner@example.test" },
      { id: "other", name: "Other", email: "other@example.test" },
    ] });
    const group = await client.expenseGroup.create({
      data: { name: "Household", userId: "owner", categories: { create: { name: "Shopping" } } },
      include: { categories: true },
    });
    const categoryId = group.categories[0].id;
    await client.payLaterProviderAssignment.createMany({ data: ["shopee", "lazada"].map((providerKey) => ({
      expenseGroupId: group.id, userId: "owner", providerKey, active: true, productEnabled: true,
    })) });
    const access = createExpenseAccess(client, async () => "owner");
    const other = createExpenseAccess(client, async () => "other");
    const installmentsFor = (expenseId: number) => client.billingInstallment.findMany({
      where: { expenseId }, orderBy: { installmentNumber: "asc" }, include: { billing: true },
    });
    const bills = () => client.billing.findMany({ where: { expenseGroupId: group.id }, orderBy: { id: "asc" } });

    const draftId = randomUUID();
    const expense = await access.create(group.id, categoryId, threeInstallments, draftId);
    assert.equal(expense.amountCentavos, 100_000);
    assert.equal(expense.date.toISOString().slice(0, 10), purchase.date);
    const original = await installmentsFor(expense.id);
    assert.deepEqual(original.map(({ installmentNumber, amountCentavos, billing }) => ({
      installmentNumber, amountCentavos, dueDate: billing.dueDate.toISOString().slice(0, 10),
    })), [
      { installmentNumber: 1, amountCentavos: 33_334, dueDate: "2026-08-05" },
      { installmentNumber: 2, amountCentavos: 33_333, dueDate: "2026-09-05" },
      { installmentNumber: 3, amountCentavos: 33_333, dueDate: "2026-10-05" },
    ]);

    const retried = await access.create(group.id, categoryId, threeInstallments, draftId);
    assert.equal(retried.id, expense.id);
    await assert.rejects(access.create(group.id, categoryId, { ...threeInstallments, spayLaterMonths: "6" }, draftId), /already saved with different details/);
    assert.equal(await client.expense.count(), 1);
    assert.deepEqual(await installmentsFor(expense.id), original);

    const sharedDraft = randomUUID();
    const sharedPurchase = {
      ...threeInstallments, title: "Second purchase", amount: "25.99", spayLaterMonths: "1",
    };
    const shared = await access.create(group.id, categoryId, sharedPurchase, sharedDraft);
    const sharedInstallments = await installmentsFor(shared.id);
    assert.equal(sharedInstallments.length, 1);
    assert.equal(sharedInstallments[0].billingId, original[0].billingId);
    assert.equal(sharedInstallments[0].amountCentavos, 2_599);

    const mixed = await access.create(group.id, categoryId, {
      ...threeInstallments, title: "Another cycle", date: "2026-07-06", spayLaterDueDay: "15", spayLaterMonths: "1",
    }, randomUUID());
    const mixedInstallments = await installmentsFor(mixed.id);
    assert.equal(mixedInstallments[0].billing.dueDate.toISOString().slice(0, 10), "2026-08-15");
    assert.notEqual(mixedInstallments[0].billingId, original[0].billingId);
    assert.equal((await bills()).length, 4);

    const legacy = await access.create(group.id, categoryId, { ...purchase, title: "Old form purchase" }, randomUUID());
    assert.deepEqual(await installmentsFor(legacy.id), []);
    await assert.rejects(other.create(group.id, categoryId, threeInstallments, randomUUID()), /not found in this expense group/);
    await assert.rejects(other.delete(group.id, expense.id), /not found in this expense group/);
    await assert.rejects(other.update(group.id, expense.id, categoryId, purchase, expense.updatedAt.toISOString()), /not found in this expense group/);

    const renamed = await access.update(group.id, expense.id, categoryId, {
      ...purchase, title: "Renamed only",
    }, expense.updatedAt.toISOString());
    assert.deepEqual(await installmentsFor(expense.id), original);

    const rescheduled = await access.update(group.id, expense.id, categoryId, {
      ...purchase, spayLaterDueDay: "15", spayLaterMonths: "1", spayLaterCompletedOn: "2026-08-12", amount: "42.01",
    }, renamed.updatedAt.toISOString());
    const rescheduledInstallments = await installmentsFor(expense.id);
    assert.equal(rescheduled.amountCentavos, 4_201);
    assert.equal(rescheduledInstallments.length, 1);
    assert.equal(rescheduledInstallments[0].amountCentavos, 4_201);
    assert.equal(rescheduledInstallments[0].billing.dueDate.toISOString().slice(0, 10), "2026-09-15");
    assert.deepEqual((await bills()).map(({ id }) => id), [
      sharedInstallments[0].billingId, mixedInstallments[0].billingId, rescheduledInstallments[0].billingId,
    ]);
    assert.deepEqual(await installmentsFor(shared.id), sharedInstallments);
    assert.equal((await access.create(group.id, categoryId, threeInstallments, draftId)).id, expense.id);
    assert.deepEqual(await installmentsFor(expense.id), rescheduledInstallments);

    const reverted = await access.update(group.id, expense.id, categoryId, {
      ...purchase, amount: "42.01", spayLaterCompletedOn: "",
    }, rescheduled.updatedAt.toISOString());
    const revertedInstallments = await installmentsFor(expense.id);
    assert.equal(revertedInstallments.length, 1);
    assert.equal(revertedInstallments[0].billing.dueDate.toISOString().slice(0, 10), "2026-07-15");
    assert.equal(await client.billing.count({ where: { id: rescheduledInstallments[0].billingId } }), 0);

    await access.update(group.id, expense.id, categoryId, {
      ...purchase, amount: "42.01", payLaterProviderKey: "lazada",
    }, reverted.updatedAt.toISOString());
    assert.deepEqual(await installmentsFor(expense.id), []);
    assert.equal(await client.billing.count({ where: { id: revertedInstallments[0].billingId } }), 0);
    await access.delete(group.id, shared.id);
    await assert.rejects(access.create(group.id, categoryId, sharedPurchase, sharedDraft), /already saved and has since been deleted/);
    assert.deepEqual(await installmentsFor(shared.id), []);
    assert.deepEqual((await bills()).map(({ id }) => id), [mixedInstallments[0].billingId]);
    assert.deepEqual(await installmentsFor(mixed.id), mixedInstallments);

    for (const invalid of [
      { spayLaterDueDay: "", spayLaterMonths: "3" },
      { spayLaterDueDay: "10" },
      { spayLaterMonths: "2" },
      { spayLaterCompletedOn: "2026-02-29" },
      { payLaterProviderKey: "lazada" },
    ]) {
      await assert.rejects(access.create(group.id, categoryId, { ...threeInstallments, ...invalid }, randomUUID()), TypeError);
    }

    await db.exec(`
      CREATE FUNCTION reject_billing_installment() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test installment failure'; END;
      $$;
      CREATE TRIGGER reject_billing_installment BEFORE INSERT ON "BillingInstallment"
      FOR EACH ROW EXECUTE FUNCTION reject_billing_installment();
    `);
    const beforeFailure = await bills();
    const expenseCount = await client.expense.count();
    const failedDraft = randomUUID();
    await assert.rejects(access.create(group.id, categoryId, threeInstallments, failedDraft), /test installment failure/);
    assert.equal(await client.expense.count(), expenseCount);
    assert.equal(await client.expenseSubmission.count({ where: { expenseGroupId: group.id, id: failedDraft } }), 0);
    assert.deepEqual(await bills(), beforeFailure);

    await assert.rejects(access.update(group.id, mixed.id, categoryId, {
      ...purchase, date: "2026-08-12", amount: "42.01",
    }, mixed.updatedAt.toISOString()), /test installment failure/);
    assert.deepEqual(await client.expense.findUnique({ where: { id: mixed.id } }), mixed);
    assert.deepEqual(await installmentsFor(mixed.id), mixedInstallments);
    assert.deepEqual(await bills(), beforeFailure);

    await db.exec('DROP TRIGGER reject_billing_installment ON "BillingInstallment"');
    const recovered = await access.create(group.id, categoryId, threeInstallments, failedDraft);
    assert.equal((await installmentsFor(recovered.id)).length, 3);
  } finally {
    await fixture.close();
  }
});
