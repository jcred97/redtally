import assert from "node:assert/strict";
import test from "node:test";
import { createHomeDashboardAccess } from "../../app/(dashboard)/_home/dashboard/access";
import { createExpenseGroupAccess } from "../../app/(dashboard)/_lib/expense-groups/access";
import { parseExpenseDate } from "../../app/lib/expenses/date";
import { createTestDatabase } from "../helpers/database";

test("home dashboard reports selected owned groups across matched periods", async () => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.createMany({ data: [
      { id: "owner", name: "Owner", email: "owner@example.test" },
      { id: "foreign", name: "Foreign", email: "foreign@example.test" },
    ] });
    const month = "2026-03";
    const today = "2026-03-02";

    async function addGroup(name: string, userId: string | null, budget?: number) {
      const group = await client.expenseGroup.create({
        data: {
          name, userId, categories: { create: { name: "Food" } },
          ...(budget === undefined ? {} : {
            budgets: { create: { budgetMonth: parseExpenseDate(`${month}-01`), amountCentavos: budget } },
          }),
        },
        include: { categories: { select: { id: true } } },
      });
      return { ...group, categoryId: group.categories[0].id };
    }
    const budgeted = await addGroup("Budgeted", "owner", 500);
    const unbudgeted = await addGroup("Unbudgeted", "owner");
    const emptyBudget = await addGroup("Empty budget", "owner", 150);
    const excluded = await addGroup("Budgeted (copy)", "owner", 500);
    const foreign = await addGroup("Foreign", "foreign", 800);
    const legacy = await addGroup("Legacy", null, 900);

    function expense(group: typeof budgeted, day: string, amountCentavos: number, merchant?: string) {
      return {
        expenseGroupId: group.id, categoryId: group.categoryId, title: `Expense ${group.name}`,
        date: parseExpenseDate(day), amountCentavos, merchant,
      };
    }
    // Current-month activity, comparison cutoff, excluded copy, foreign and legacy totals.
    await client.expense.createMany({ data: [
      expense(budgeted, "2026-02-02", 100), expense(unbudgeted, "2026-02-03", 99),
      expense(budgeted, "2026-03-01", 10, "Coffee Shop"),
      { ...expense(budgeted, "2026-03-02", 20, "coffee shop"), date: new Date("2026-03-02T23:59:59Z") },
      expense(budgeted, "2026-03-03", 30),
      expense(unbudgeted, "2026-03-02", 45),
      expense(excluded, "2026-03-01", 10, "Coffee Shop"),
      expense(foreign, "2026-03-02", 800, "Foreign shop"), expense(legacy, "2026-03-02", 900),
    ] });
    function schedule(group: typeof budgeted, title: string, due: string, status: "ACTIVE" | "PAUSED" | "NEEDS_ATTENTION" = "ACTIVE", end?: string) {
      return {
        title, expenseGroupId: group.id, categoryId: group.categoryId, amountCentavos: 100,
        frequency: "MONTHLY" as const, status, nextDueDate: parseExpenseDate(due),
        startDate: parseExpenseDate("2026-02-01"), endDate: end ? parseExpenseDate(end) : undefined,
      };
    }
    await client.recurringExpense.createMany({ data: [
      schedule(budgeted, "Due today", today),
      schedule(unbudgeted, "Future", "2026-04-01"),
      schedule(budgeted, "Overdue", "2026-03-01"),
      schedule(unbudgeted, "Blocked", "2026-03-03", "NEEDS_ATTENTION"),
      schedule(budgeted, "Paused", "2026-03-04", "PAUSED"),
      schedule(budgeted, "Ended", "2026-03-04", "ACTIVE", "2026-03-03"),
      schedule(excluded, "Excluded schedule", today),
      schedule(foreign, "Private schedule", today),
    ] });

    const owner = createHomeDashboardAccess(client, async () => "owner");
    const result = await owner.get([
      budgeted.publicId, budgeted.publicId.toUpperCase(), unbudgeted.publicId, emptyBudget.publicId,
      foreign.publicId, legacy.publicId, "invalid-id",
    ], month, today);
    assert.ok(result);
    assert.deepEqual(result.groups.map(({ publicId }) => publicId), [budgeted.publicId, emptyBudget.publicId, unbudgeted.publicId]);
    assert.equal(result.expenseCount, 3);
    assert.deepEqual(result.dailyCentavos, [BigInt(10), BigInt(75)]);
    assert.equal(result.totalCentavos, BigInt(75));
    assert.deepEqual(result.comparison, {
      month: "2026-02", throughDay: "2026-02-02", dailyCentavos: [BigInt(0), BigInt(100)], totalCentavos: BigInt(100),
    });
    assert.deepEqual(result.budget, { groupCount: 2, targetCentavos: BigInt(650), spentCentavos: BigInt(30), unbudgetedCentavos: BigInt(45) });
    assert.deepEqual(result.categories.map(({ name, group, totalCentavos }) => [name, group.id, totalCentavos]), [
      ["Food", unbudgeted.id, BigInt(45)], ["Food", budgeted.id, BigInt(30)],
    ]);
    assert.equal(result.merchants.length, 1);
    const [merchant] = result.merchants;
    assert.equal(merchant.totalCentavos, BigInt(30));
    const history = createExpenseGroupAccess(client, async () => "owner");
    const drilldown = await history.getExpensePageById(merchant.group.id, 1, { month, through: today, merchant: merchant.filter });
    assert.equal(drilldown?.totalCentavos, merchant.totalCentavos);
    assert.equal(drilldown?.totalExpenses, merchant.expenseCount);
    assert.equal(result.recentExpenses.length, 3);
    assert.equal(result.recentExpenses[0]?.group.id, budgeted.id);
    assert.deepEqual(result.upcoming.map(({ title, nextDueDate }) => [title, nextDueDate]), [
      ["Due today", parseExpenseDate(today)], ["Future", parseExpenseDate("2026-04-01")],
    ]);
    assert.deepEqual(result.attention.map(({ title, reason }) => [title, reason]), [["Blocked", "blocked"], ["Overdue", "overdue"]]);

    const empty = await owner.get([foreign.publicId, legacy.publicId], month, today);
    assert.deepEqual(empty, await owner.get([], month, today));
    assert.deepEqual(empty?.groups, []);
    assert.deepEqual(empty?.recentExpenses, []);
    assert.equal(await owner.get([budgeted.publicId], "2026-13", today), null);
    const unsigned = createHomeDashboardAccess(client, async () => { throw new Error("Sign in required"); });
    await assert.rejects(unsigned.get([], month, today), /Sign in required/);
  } finally {
    await fixture.close();
  }
});
