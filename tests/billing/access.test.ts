import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createExpenseAccess } from "../../app/(dashboard)/_lib/expenses/access";
import { createBillingAccess } from "../../app/(dashboard)/expense-groups/[id]/_lib/billing/access";
import { createTestDatabase } from "../helpers/database";

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

test("billing reads isolate expense groups, order the populated cycles, and total shared bills exactly", async (context) => {
  const { client, close } = await createTestDatabase();
  context.after(close);
  await client.user.createMany({ data: [
    { id: "owner", name: "Owner", email: "owner@example.test" },
    { id: "other", name: "Other", email: "other@example.test" },
  ] });
  const group = await client.expenseGroup.create({
    data: { name: "Household", userId: "owner", categories: { create: { name: "Shopping" } } },
    include: { categories: true },
  });
  const foreign = await client.expenseGroup.create({ data: { name: "Private", userId: "other" } });
  const billing = createBillingAccess(client, async () => "owner");
  const otherBilling = createBillingAccess(client, async () => "other");
  assert.deepEqual(await billing.get(group.id), []);
  assert.equal(await billing.get(foreign.id), null);
  assert.equal(await billing.get(2_147_483_647), null);

  await client.payLaterProviderAssignment.create({ data: {
    expenseGroupId: group.id, userId: "owner", providerKey: "shopee", active: true, productEnabled: true,
  } });
  const expenseAccess = createExpenseAccess(client, async () => "owner");
  const purchase = {
    date: "2026-06-26", paymentMethod: "PAY_LATER", payLaterProviderKey: "shopee", spayLaterMonths: "3",
  };
  const save = (input: typeof purchase & { title: string; amount: string; spayLaterDueDay: string }) =>
    expenseAccess.create(group.id, group.categories[0].id, input, randomUUID());

  await save({ ...purchase, title: "15th-cycle purchase", amount: "6.00", spayLaterDueDay: "15" });
  await save({ ...purchase, title: "Later bill", amount: "20.00", date: "2026-10-26", spayLaterDueDay: "5", spayLaterMonths: "1" });
  await save({ ...purchase, title: "Three installments", amount: "1000.00", spayLaterDueDay: "5" });
  await save({ ...purchase, title: "Single payment", amount: "21474836.47", spayLaterDueDay: "5", spayLaterMonths: "1" });

  const emptyBill = await client.billing.create({ data: {
    expenseGroupId: group.id, dueDay: 5, periodStart: new Date("2026-11-25"), periodEnd: new Date("2026-12-24"),
    statementDate: new Date("2026-12-25"), dueDate: new Date("2027-01-05"),
  } });
  assert.equal(await otherBilling.get(group.id), null);
  assert.deepEqual(await otherBilling.get(foreign.id), []);

  const cycles = await billing.get(group.id);
  assert.ok(cycles);
  assert.deepEqual(cycles.map(({ dueDay, bills }) => ({
    dueDay,
    bills: bills.map(({ dueDate, totalCentavos }) => [day(dueDate), totalCentavos]),
  })), [
    { dueDay: 5, bills: [
      ["2026-08-05", BigInt(2_147_516_981)], ["2026-09-05", BigInt(33_333)],
      ["2026-10-05", BigInt(33_333)], ["2026-12-05", BigInt(2_000)],
    ] },
    { dueDay: 15, bills: [["2026-07-15", BigInt(200)], ["2026-08-15", BigInt(200)], ["2026-09-15", BigInt(200)]] },
  ]);
  assert.ok(cycles.every(({ bills }) => bills.every(({ id }) => id !== emptyBill.id)));

  const firstBill = cycles[0].bills[0];
  assert.equal(day(firstBill.periodStart), "2026-06-25");
  assert.equal(day(firstBill.periodEnd), "2026-07-24");
  assert.equal(firstBill.installments.length, 2);
  const lines = firstBill.installments.map(({ installmentNumber, amountCentavos, expense: { title, spayLaterMonths } }) => ({
    installmentNumber, amountCentavos, title, spayLaterMonths,
  }));
  assert.deepEqual(lines.sort((first, second) => first.amountCentavos - second.amountCentavos), [
    { installmentNumber: 1, amountCentavos: 33_334, title: "Three installments", spayLaterMonths: 3 },
    { installmentNumber: 1, amountCentavos: 2_147_483_647, title: "Single payment", spayLaterMonths: 1 },
  ]);
});
