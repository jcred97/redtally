import { createTestDatabase } from "../helpers/database";
import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardAccess } from "../../app/(dashboard)/spending/[id]/_lib/dashboard/access";
import { getDashboardPeriod, shiftDashboardMonth } from "../../app/(dashboard)/spending/[id]/_lib/dashboard/period";

test("dashboard periods cap ongoing comparisons, cover closed months, and respect calendar bounds", () => {
  assert.deepEqual(getDashboardPeriod("2028-03", "2028-03-31"), {
    month: "2028-03", throughDay: "2028-03-31",
    comparison: { month: "2028-02", throughDay: "2028-02-29" },
  });
  assert.deepEqual(getDashboardPeriod("2028-03", "2028-03-03")?.comparison, {
    month: "2028-02", throughDay: "2028-02-03",
  });
  assert.deepEqual(getDashboardPeriod("2026-01", "2026-02-17"), {
    month: "2026-01", throughDay: "2026-01-31",
    comparison: { month: "2025-12", throughDay: "2025-12-31" },
  });
  assert.deepEqual(getDashboardPeriod("2026-11", "2026-02-17"), {
    month: "2026-11", throughDay: "2026-11-30", comparison: null,
  });
  assert.equal(getDashboardPeriod("0001-01", "2026-02-17")?.comparison, null);
  assert.equal(getDashboardPeriod("9999-12", "2026-02-17")?.throughDay, "9999-12-31");
  assert.equal(getDashboardPeriod("2026-13", "2026-02-17"), null);
  assert.equal(getDashboardPeriod("2026-03", "2026-03-32"), null);
  assert.equal(shiftDashboardMonth("0001-01", -1), undefined);
  assert.equal(shiftDashboardMonth("0001-12", 1), "0002-01");
  assert.equal(shiftDashboardMonth("9999-12", 1), undefined);
});

test("dashboard totals and monthly budget writes use the owned group and authoritative records", async (t) => {
  const fixture = await createTestDatabase();
  const { client } = fixture;

  try {
    await client.user.createMany({
      data: [
        { id: "alice", name: "Alice", email: "alice@example.test" },
        { id: "bob", name: "Bob", email: "bob@example.test" },
      ],
    });

    const own = await client.expenseGroup.create({ data: { userId: "alice", name: "Personal" } });
    const foreign = await client.expenseGroup.create({ data: { userId: "bob", name: "Other" } });
    const unclaimed = await client.expenseGroup.create({ data: { name: "Legacy group" } });
    const [groceries, transport, other] = await Promise.all([
      { expenseGroupId: own.id, name: "Groceries" },
      { expenseGroupId: own.id, name: "Transport" },
      { expenseGroupId: foreign.id, name: "Foreign category" },
      { expenseGroupId: own.id, name: "Unused" },
    ].map((data) => client.category.create({ data })));
    const add = (category: typeof groceries, date: string, amountCentavos: number) => ({
      expenseGroupId: category.expenseGroupId,
      categoryId: category.id,
      date: new Date(date + "Z"),
      title: category.name,
      amountCentavos,
    });
    await client.expense.createMany({
      data: [
        add(groceries, "2026-01-31T00:00:00", 30),
        add(groceries, "2026-02-01T00:00:00", 50),
        add(transport, "2026-02-28T19:45:00", 70),
        add(groceries, "2026-03-01T00:00:00", 10),
        add(groceries, "2026-03-01T03:00:00", 20),
        add(transport, "2026-03-02T00:00:00", 2_147_483_647),
        add(transport, "2026-03-30T23:59:59", 2_147_483_647),
        add(transport, "2026-03-31T00:00:00", 100),
        add(other, "2026-03-01T00:00:00", 1000),
      ],
    });

    const alice = createDashboardAccess(client, async () => "alice");
    const bob = createDashboardAccess(client, async () => "bob");
    const anonymous = createDashboardAccess(client, async () => { throw new Error("Sign in required"); });
    const month = "2026-03";
    const today = "2026-03-30";

    await t.test("reads day totals, counts, and category totals including legacy times and exact large sums", async () => {
      const data = await alice.get(own.id, month, today);
      assert.ok(data);
      assert.equal(data.budgetCentavos, null);
      assert.equal(data.throughDay, today);
      assert.equal(data.expenseCount, 4);
      assert.equal(data.totalCentavos, 4_294_967_324);
      assert.equal(data.dailyCentavos.length, 30);
      assert.deepEqual(data.dailyCentavos.slice(0, 3), [30, 2_147_483_677, 2_147_483_677]);
      assert.equal(data.dailyCentavos.at(-1), data.totalCentavos);
      assert.deepEqual(data.categories, [
        { id: transport.id, name: "Transport", totalCentavos: 4_294_967_294, expenseCount: 2 },
        { id: groceries.id, name: "Groceries", totalCentavos: 30, expenseCount: 2 },
      ]);
      assert.equal(data.comparison?.throughDay, "2026-02-28");
      assert.equal(data.comparison?.dailyCentavos.at(-1), 120);

      const early = await alice.get(own.id, month, "2026-03-02");
      assert.equal(early?.comparison?.throughDay, "2026-02-02");
      assert.deepEqual(early?.comparison?.dailyCentavos, [50, 50]);

      const closed = await alice.get(own.id, month, "2026-04-01");
      assert.equal(closed?.throughDay, "2026-03-31");
      assert.equal(closed?.totalCentavos, 4_294_967_424);

      const future = await alice.get(own.id, "2026-04", today);
      assert.deepEqual(future?.dailyCentavos, Array(30).fill(0));
      assert.equal(future?.comparison, null);
      assert.equal(future?.expenseCount, 0);
      assert.deepEqual(future?.categories, []);
    });

    await t.test("sets, edits, and removes one budget in the selected group and month", async () => {
      await alice.saveBudget(own.id, month, "123.45");
      const where = { expenseGroupId_budgetMonth: { expenseGroupId: own.id, budgetMonth: new Date("2026-03-01") } };
      await client.budget.update({ where, data: { description: "Existing note" } });
      await alice.saveBudget(own.id, "2026-02", "1");
      await alice.saveBudget(own.id, month, "500");
      assert.equal(await client.budget.count({ where: { expenseGroupId: own.id } }), 2);
      assert.equal((await alice.get(own.id, month, today))?.budgetCentavos, 50_000);
      assert.equal((await client.budget.findUnique({ where }))?.description, "Existing note");

      await alice.removeBudget(own.id, month);
      await alice.removeBudget(own.id, month);
      assert.equal((await alice.get(own.id, month, today))?.budgetCentavos, null);
      assert.equal((await alice.get(own.id, "2026-02", today))?.budgetCentavos, 100);
      assert.equal((await alice.get(own.id, month, today))?.expenseCount, 4);
    });

    await t.test("rejects foreign, unclaimed, malformed, and anonymous operations", async () => {
      await bob.saveBudget(foreign.id, month, "10");
      for (const id of [foreign.id, unclaimed.id, 2_147_483_648, NaN]) {
        assert.equal(await alice.get(id, month, today), null);
        await assert.rejects(alice.saveBudget(id, month, "1"), /Expense group not found/);
        await assert.rejects(alice.removeBudget(id, month), /Expense group not found/);
      }
      assert.equal((await bob.get(foreign.id, month, today))?.budgetCentavos, 1_000);
      assert.equal(await alice.get(own.id, "2026-13", today), null);
      await assert.rejects(alice.saveBudget(own.id, "2026-13", "1"), /valid budget month/);
      await assert.rejects(alice.removeBudget(own.id, "2026-03-01"), /valid budget month/);
      for (const amount of [null, "0", "-1", "1.001", "21474836.48"]) {
        await assert.rejects(alice.saveBudget(own.id, month, amount), TypeError);
      }
      await assert.rejects(anonymous.get(own.id, month, today), /Sign in required/);
      await assert.rejects(anonymous.saveBudget(own.id, month, "1"), /Sign in required/);
      await assert.rejects(anonymous.removeBudget(own.id, month), /Sign in required/);
      assert.equal(await client.budget.count({ where: { expenseGroupId: own.id } }), 1);
    });
  } finally {
    await fixture.close();
  }
});
