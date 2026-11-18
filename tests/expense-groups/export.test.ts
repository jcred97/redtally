import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Papa from "papaparse";
import { createExpenseGroupAccess, type ExpenseHistoryFilters } from "../../app/(dashboard)/_lib/expense-groups/access";
import { expenseCsvResponse } from "../../app/(dashboard)/spending/[id]/_lib/expenses/export";
import { parseExpenseGroupQuery } from "../../app/(dashboard)/spending/[id]/_lib/navigation";
import { createTestDatabase } from "../helpers/database";

test("history export uses bounded owner-only batches and the history filters", async (t) => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.createMany({ data: [
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
    ] });
    const alice = createExpenseGroupAccess(client, async () => "alice");
    const bob = createExpenseGroupAccess(client, async () => "bob");
    const anonymous = createExpenseGroupAccess(client, async () => { throw new Error("Sign in required"); });
    const group = await alice.create("History");
    const foreign = await bob.create("Foreign");
    const unclaimed = await client.expenseGroup.create({ data: { name: "Unclaimed" } });
    const category = await client.category.create({ data: { expenseGroupId: group.id, name: "Food, café 🍱" } });
    const otherCategory = await client.category.create({ data: { expenseGroupId: group.id, name: "Other" } });
    const bank = await client.bank.findFirstOrThrow();
    const assignment = await client.bankAssignment.create({ data: { expenseGroupId: group.id, bankId: bank.id, active: false } });
    await client.expense.createMany({ data: Array.from({ length: 1103 }, (_, index) => ({
      expenseGroupId: group.id, categoryId: index % 2 ? category.id : otherCategory.id,
      title: `Expense ${index}`, amountCentavos: index === 0 ? 2147483647 : index + 1,
      date: new Date(index % 3 === 0 ? "2026-10-31" : index % 3 === 1 ? "2026-11-01" : "2026-11-18"),
      timeMinutes: index % 2 ? 0 : null,
      merchant: index % 3 ? "Coffee Shop" : null,
      bankAssignmentId: index % 2 ? assignment.id : null,
      legacyBankName: index % 2 ? null : "Legacy bank",
      paymentMethod: index % 2 ? "CREDIT_CARD" : "CASH",
      notes: index % 2 ? 'A "quoted" note\nsecond line' : null,
    })) });

    await t.test("rejects anonymous, foreign, unclaimed, missing, and invalid groups", async () => {
      await assert.rejects(anonymous.prepareExpenseExport(group.id), /Sign in required/);
      for (const id of [foreign.id, unclaimed.id, 2147483647, 0, -1, NaN, 2147483648]) {
        assert.equal(await alice.prepareExpenseExport(id), null);
      }
      assert.equal(await bob.prepareExpenseExport(group.id), null);
    });

    await t.test("exports every page once, in batches of at most 500", async () => {
      const source = await alice.prepareExpenseExport(group.id);
      assert.ok(source);
      const sizes: number[] = [];
      const ids: number[] = [];
      for await (const batch of source.batches()) {
        sizes.push(batch.length);
        ids.push(...batch.map((row) => row.id));
      }
      assert.deepEqual(sizes, [500, 500, 103]);
      assert.equal(new Set(ids).size, 1103);
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
      const response = expenseCsvResponse(source);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.match(response.headers.get("content-disposition")!, /attachment; filename="expenses-[a-f0-9-]+\.csv"/);
      const csv = Papa.parse<Record<string, string>>(await response.text(), { header: true, skipEmptyLines: true });
      assert.deepEqual(csv.errors, []);
      assert.equal(csv.data.length, 1103);
      assert.equal(csv.data[0]["Amount (PHP)"], "21474836.47");
      assert.equal(csv.data[1]["Time (Asia/Manila)"], "00:00");
      assert.equal(csv.data[0]["Time (Asia/Manila)"], "");
      assert.equal(csv.data[1].Notes, 'A "quoted" note\nsecond line');
      assert.equal(csv.data[1].Bank, bank.name);
      assert.equal(csv.data[0].Bank, "Legacy bank");
    });

    await t.test("all filters reconcile with history counts and exact totals", async () => {
      const merchant = createHash("sha256").update("coffee shop").digest("hex");
      const legacyKey = createHash("sha256").update("Legacy bank").digest("hex");
      const cases: ExpenseHistoryFilters[] = [
        {}, { month: "2026-11" }, { day: "2026-10-31" },
        { month: "2026-11", through: "2026-11-01" }, { categoryId: category.id },
        { bank: { assignmentId: assignment.id } }, { bank: { legacyKey } },
        { merchant }, { merchant: "none" }, { paymentMethod: "CASH" },
        { month: "2026-11", categoryId: category.id, paymentMethod: "CREDIT_CARD", merchant },
        { categoryId: 2147483647 },
        parseExpenseGroupQuery({ month: "invalid", category: ["1", "2"], page: "9" }, "2026-11-18").filters,
      ];
      for (const filters of cases) {
        const source = await alice.prepareExpenseExport(group.id, filters);
        const page = await alice.getExpensePageById(group.id, 1, filters);
        assert.ok(source && page);
        let count = 0;
        let total = BigInt(0);
        for await (const batch of source.batches()) {
          count += batch.length;
          for (const row of batch) total += BigInt(row.amountCentavos);
        }
        assert.equal(count, page.totalExpenses);
        assert.equal(total, page.totalCentavos);
      }
    });

    await t.test("empty export returns a usable header and excludes newer inserts", async () => {
      const empty = await alice.prepareExpenseExport(foreign.id);
      assert.equal(empty, null);
      const ownEmpty = await alice.create("Empty");
      const source = await alice.prepareExpenseExport(ownEmpty.id);
      assert.ok(source);
      const bytes = new Uint8Array(await expenseCsvResponse(source).arrayBuffer());
      assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.equal(Papa.parse(new TextDecoder().decode(bytes), { header: true, skipEmptyLines: true }).data.length, 0);

      const prepared = await alice.prepareExpenseExport(group.id);
      assert.ok(prepared);
      const newer = await client.expense.create({ data: {
        expenseGroupId: group.id, categoryId: category.id, title: "Newer", amountCentavos: 10, date: new Date("2026-11-18"),
      } });
      let count = 0;
      for await (const batch of prepared.batches()) {
        assert.ok(batch.every((row) => row.id !== newer.id));
        count += batch.length;
      }
      assert.equal(count, 1103);
      await client.expense.delete({ where: { id: newer.id } });
    });

    await t.test("ownership changes stop subsequent batches", async () => {
      const source = await alice.prepareExpenseExport(group.id);
      assert.ok(source);
      const batches = source.batches();
      assert.equal((await batches.next()).value?.length, 500);
      await client.expenseGroup.update({ where: { id: group.id }, data: { userId: "bob" } });
      assert.equal((await batches.next()).done, true);
    });
  } finally { await fixture.close(); }
});
