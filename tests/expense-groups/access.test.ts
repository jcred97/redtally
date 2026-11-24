import { createTestDatabase } from "../helpers/database";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createBankAccess } from "../../app/(dashboard)/_lib/banks/access";
import {
  createExpenseGroupAccess,
  parseExpenseHistoryBankFilter,
  parseExpenseHistoryMerchantFilter,
  parseExpenseHistoryPayLaterProviderFilter,
  parseExpenseHistoryPaymentMethod,
} from "../../app/(dashboard)/_lib/expense-groups/access";

test("expense-group access isolates users and unclaimed data using real Prisma queries", async (t) => {
  // An isolated, in-memory PostgreSQL instance. Never reads DATABASE_URL.
  const fixture = await createTestDatabase();
  const { client } = fixture;

  try {

    await client.user.createMany({
      data: [
        { id: "alice", name: "Alice", email: "alice@example.test" },
        { id: "bob", name: "Bob", email: "bob@example.test" },
      ],
    });

    const alice = createExpenseGroupAccess(client, async () => "alice");
    const bob = createExpenseGroupAccess(client, async () => "bob");
    const anonymous = createExpenseGroupAccess(client, async () => {
      throw new Error("Sign in required");
    });

    const a = await alice.create("Alice private group");
    const b = await bob.create("Bob private group");
    const legacy = await client.expenseGroup.create({
      data: { name: "Unclaimed demo" },
    });

    for (const group of [a, b, legacy]) {
      const category = await client.category.create({
        data: {
          name: `${group.name} category`,
          expenseGroupId: group.id,
        },
      });

      await client.expense.create({
        data: {
          title: `${group.name} expense`,
          amountCentavos: 12345,
          date: new Date("2026-10-24T00:00:00Z"),
          categoryId: category.id,
          expenseGroupId: group.id,
        },
      });
    }

    await t.test("list includes only the signed-in user's group summaries", async () => {
      for (const [access, group] of [[alice, a], [bob, b]] as const) {
        assert.deepEqual(await access.list(), [{
          id: group.id,
          publicId: group.publicId,
          name: group.name,
          categoryCount: BigInt(1),
          expenseCount: BigInt(1),
          totalCentavos: BigInt(12345),
        }]);
      }
    });

    await t.test("the group switcher only lists the signed-in user's group IDs and names", async () => {
      assert.deepEqual(await alice.listForSwitcher(), [{ id: a.id, publicId: a.publicId, name: a.name }]);
      assert.deepEqual(await bob.listForSwitcher(), [{ id: b.id, publicId: b.publicId, name: b.name }]);
    });

    await t.test("empty history checks distinguish a new group from older expenses matching the other filters", async () => {
      const category = await client.category.findFirstOrThrow({ where: { expenseGroupId: a.id } });
      const filters = { month: "2026-11", categoryId: category.id };
      const empty = await alice.create("No expense history");
      try {
        assert.equal(await alice.getExpenseHistoryAvailability(empty.id, filters), "none");
      } finally {
        await alice.delete(empty.id);
      }

      assert.equal(await alice.getExpenseHistoryAvailability(a.id, filters), "older");
      assert.equal(await alice.getExpenseHistoryAvailability(a.id, { ...filters, merchant: "0".repeat(64) }), "other");
      assert.equal(await alice.getExpenseHistoryAvailability(a.id, { month: "2026-09" }), "other");
      assert.equal(await alice.getExpenseHistoryAvailability(a.id, { ...filters, day: "2026-10-25" }), "older");
      assert.equal(await alice.getExpenseHistoryAvailability(a.id, { ...filters, day: "2026-10-23" }), "other");
      assert.equal(await alice.getExpenseHistoryAvailability(a.id, {}), "other");
      assert.equal(await bob.getExpenseHistoryAvailability(a.id, filters), null);
      assert.equal(await alice.getExpenseHistoryAvailability(legacy.id, filters), null);
      await assert.rejects(anonymous.getExpenseHistoryAvailability(a.id, filters), /Sign in required/);
    });

    await t.test("public and legacy route keys resolve only for the current owner", async () => {
      for (const [access, own, denied] of [
        [alice, a, [b, legacy]],
        [bob, b, [a, legacy]],
      ] as const) {
        const expected = { id: own.id, publicId: own.publicId };
        assert.match(own.publicId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        assert.deepEqual(await access.resolveRoute(own.publicId), expected);
        assert.deepEqual(await access.resolveRoute(own.publicId.toUpperCase()), expected);
        assert.deepEqual(await access.resolveRoute(String(own.id)), expected);

        for (const other of denied) {
          assert.equal(await access.resolveRoute(other.publicId), null);
          assert.equal(await access.resolveRoute(String(other.id)), null);
        }
      }

      for (const key of [
        "", "0", "-1", "1.5", "1e0", "0x1", "01", " 1", "1 ", "2147483648",
        "not-a-uuid", a.publicId.replaceAll("-", ""), ` ${a.publicId}`,
        "00000000-0000-0000-0000-000000000000", "00000000-0000-4000-8000-000000000000",
      ]) {
        assert.equal(await alice.resolveRoute(key), null);
      }
    });

    await t.test("guessed IDs cannot reveal other users or unclaimed groups and expenses", async () => {
      for (const [access, own, denied] of [
        [alice, a, [b, legacy]],
        [bob, b, [a, legacy]],
      ] as const) {
        assert.equal((await access.getById(own.id))?.id, own.id);
        assert.equal((await access.getExpensePageById(own.id, 1))?.expenses.length, 1);

        for (const other of denied) {
          assert.equal(await access.getById(other.id), null);
          assert.equal(await access.getExpensePageById(other.id, 1), null);
          await assert.rejects(access.rename(other.id, "Foreign rename"), /^Error: Expense group not found$/);
          await assert.rejects(access.duplicate(other.id), /^Error: Expense group not found$/);
          await assert.rejects(
            access.delete(other.id),
            /^Error: Expense group not found$/,
          );
        }
      }

      assert.equal(await client.expenseGroup.count(), 3);
      assert.equal(await client.expense.count(), 3);
    });

    await t.test("anonymous callers cannot read or mutate, including invalid input", async () => {
      const before = await client.expenseGroup.count();

      for (const invoke of [
        () => anonymous.list(),
        () => anonymous.listForSwitcher(),
        () => anonymous.resolveRoute(a.publicId),
        () => anonymous.resolveRoute(String(a.id)),
        () => anonymous.resolveRoute("invalid"),
        () => anonymous.getById(a.id),
        () => anonymous.getExpensePageById(a.id, 1),
        () => anonymous.create("Injected"),
        () => anonymous.rename(a.id, "Injected"),
        () => anonymous.duplicate(a.id),
        () => anonymous.delete(a.id),
        () => anonymous.create(null),
        () => anonymous.getById(Number.NaN),
        () => anonymous.getById(2_147_483_648),
        () => anonymous.getExpensePageById(2_147_483_648, 1),
        () => anonymous.delete(2_147_483_648),
      ]) {
        await assert.rejects(invoke(), /Sign in required/);
      }

      assert.equal(await client.expenseGroup.count(), before);
    });

    await t.test("each call resolves its current identity rather than retaining a previous user", async () => {
      let currentUser = "alice";
      const access = createExpenseGroupAccess(client, async () => currentUser);

      assert.deepEqual((await access.list()).map((group) => group.id), [a.id]);
      assert.deepEqual(await access.resolveRoute(a.publicId), { id: a.id, publicId: a.publicId });

      currentUser = "bob";

      assert.deepEqual((await access.list()).map((group) => group.id), [b.id]);
      assert.equal(await access.getById(a.id), null);
      assert.equal(await access.resolveRoute(a.publicId), null);
      assert.equal(await access.resolveRoute(String(a.id)), null);
      assert.deepEqual(await access.resolveRoute(b.publicId), { id: b.id, publicId: b.publicId });
    });

    await t.test("new groups use the server identity and own empty groups can be deleted", async () => {
      const created = await alice.create("  New private group  ");

      assert.equal(created.userId, "alice");
      assert.equal(created.name, "New private group");
      await assert.rejects(bob.delete(created.id), /Expense group not found/);
      await alice.delete(created.id);
      assert.equal(
        await client.expenseGroup.findUnique({ where: { id: created.id } }),
        null,
      );
    });

    await t.test("the largest PostgreSQL integer remains a valid, private group ID", async () => {
      const maxId = 2_147_483_647;

      assert.equal(await alice.getById(maxId), null);
      assert.equal(await alice.getExpensePageById(maxId, 1), null);
      await assert.rejects(alice.delete(maxId), /^Error: Expense group not found$/);

      await client.expenseGroup.create({
        data: { id: maxId, name: "Maximum valid ID", userId: "alice" },
      });

      assert.equal((await alice.getById(maxId))?.id, maxId);
      assert.equal(await bob.getById(maxId), null);
      assert.equal((await alice.getExpensePageById(maxId, 1))?.totalExpenses, 0);
      assert.equal(await bob.getExpensePageById(maxId, 1), null);
      await assert.rejects(bob.delete(maxId), /^Error: Expense group not found$/);
      await alice.delete(maxId);
      assert.equal(await client.expenseGroup.count(), 3);
    });

    await t.test("invalid IDs and invalid group names are rejected without accessing other data", async () => {
      for (const id of [
        0,
        -1,
        1.5,
        Number.NaN,
        Infinity,
        2_147_483_648,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER + 1,
      ]) {
        assert.equal(await alice.getById(id), null);
        assert.equal(await alice.getExpensePageById(id, 1), null);
        await assert.rejects(alice.rename(id, "Invalid"), /Expense group not found/);
        await assert.rejects(alice.duplicate(id), /Expense group not found/);
        await assert.rejects(alice.delete(id), /Expense group not found/);
      }

      for (const name of [
        null,
        "",
        "  ",
        "x".repeat(101),
        { name: "Fake", userId: "bob" },
      ]) {
        await assert.rejects(alice.create(name), TypeError);
        await assert.rejects(alice.rename(a.id, name), TypeError);
      }

      assert.equal(await client.expenseGroup.count(), 3);
    });

    await t.test("renaming updates only the owned group and refreshes the switcher label", async () => {
      await alice.rename(a.id, "  Personal budget  ");
      assert.deepEqual(await alice.listForSwitcher(), [{ id: a.id, publicId: a.publicId, name: "Personal budget" }]);
      assert.equal((await bob.getById(b.id))?.name, b.name);
      assert.equal((await alice.getExpensePageById(a.id, 1))?.totalExpenses, 1);
    });

    await t.test("groups with dependent records keep their categories and expenses", async () => {
      await assert.rejects(
        alice.delete(a.id),
        /Remove this expense group's categories and budgets before deleting it/,
      );
      assert.equal((await alice.getById(a.id))?.categories.length, 1);
      assert.equal((await alice.getExpensePageById(a.id, 1))?.totalExpenses, 1);
    });

    await t.test("deleting an empty group removes only its bank settings", async () => {
      const group = await alice.create("Bank settings only");
      const banks = createBankAccess(client, async () => "alice");
      const [disabledBank, enabledBank] = await client.bank.findMany({
        where: { active: true }, orderBy: { id: "asc" }, take: 2,
      });
      const settings = new FormData();
      settings.set("expenseGroupId", String(group.id));
      settings.set("supportedDebitCard", "on");
      settings.set("bankId", String(disabledBank.id));
      await banks.save(settings);
      settings.delete("supportedDebitCard");
      await banks.save(settings);
      settings.set("bankId", String(enabledBank.id));
      settings.set("supportedDebitCard", "on");
      await banks.save(settings);

      const assignments = () => client.bankAssignment.findMany({
        where: { expenseGroupId: group.id }, orderBy: { id: "asc" },
      });
      const before = await assignments();
      assert.deepEqual(before.map((row) => row.active), [false, true]);
      const otherGroup = await bob.create("Keep this bank");
      const otherAssignment = await client.bankAssignment.create({
        data: { expenseGroupId: otherGroup.id, bankId: enabledBank.id },
      });
      await assert.rejects(bob.delete(group.id), /Expense group not found/);
      assert.deepEqual(await assignments(), before);

      const budget = await client.budget.create({
        data: { expenseGroupId: group.id, budgetMonth: new Date("2026-11-01"), amountCentavos: 500 },
      });
      await assert.rejects(alice.delete(group.id), /categories and budgets/);
      assert.deepEqual(await assignments(), before);

      await client.budget.delete({ where: { id: budget.id } });
      await alice.delete(group.id);
      assert.equal(await alice.getById(group.id), null);
      assert.deepEqual(await assignments(), []);
      assert.equal(await client.bank.count({ where: { id: { in: [disabledBank.id, enabledBank.id] } } }), 2);
      assert.deepEqual(await client.bankAssignment.findUnique({ where: { id: otherAssignment.id } }), otherAssignment);
      await bob.delete(otherGroup.id);
    });

    await t.test("duplicate assigns fresh IDs and preserves exact values, relationships, and settings", async () => {
      const source = await alice.create("Travel");
      const category = await client.category.create({
        data: { expenseGroupId: source.id, name: "Travel", color: "#123abc", icon: "✈️" },
      });
      const sameName = await client.category.create({
        data: { expenseGroupId: source.id, name: "Travel" },
      });
      const bank = await client.bank.create({
        data: { name: "Clone fixture bank", key: "clone fixture bank", active: false },
      });
      const assignment = await client.bankAssignment.create({
        data: {
          expenseGroupId: source.id,
          bankId: bank.id,
          active: false,
          supportedDebitCard: false,
          supportedCreditCard: true,
          supportedBankTransfer: false,
          supportedBankPayment: false,
        },
      });
      const budgetMonth = new Date("2026-11-01T00:00:00Z");
      await client.budget.create({
        data: { expenseGroupId: source.id, budgetMonth, amountCentavos: 500_000, description: "November trip" },
      });
      await client.payLaterProviderAssignment.createMany({
        data: [
          { expenseGroupId: source.id, userId: "alice", providerKey: "custom:pay later provider", providerName: "Pay Later provider", active: true, productEnabled: false },
          { expenseGroupId: source.id, userId: "alice", providerKey: "shopee", active: false },
        ],
      });

      const date = new Date("2026-11-06T00:00:00Z");
      const ticket = await client.expense.create({
        data: {
          expenseGroupId: source.id,
          categoryId: category.id,
          bankAssignmentId: assignment.id,
          title: "Ticket",
          merchant: "Travel agency",
          amountCentavos: 115_042,
          date,
          timeMinutes: 480,
          notes: "Window seat",
          paymentMethod: "CREDIT_CARD",
        },
      });
      await client.expense.create({
        data: {
          expenseGroupId: source.id,
          categoryId: sameName.id,
          title: "Lunch",
          amountCentavos: 25_175,
          date,
          legacyBankName: "Historical bank label",
          paymentMethod: "PAY_LATER",
          payLaterProviderKey: "custom:pay later provider",
          payLaterProviderName: "Pay Later provider",
        },
      });
      await client.expenseSubmission.create({
        data: {
          id: "b4730d36-89ae-4a8f-97d3-60b01dc31101",
          expenseGroupId: source.id,
          expenseId: ticket.id,
          payloadHash: "fixture-hash",
        },
      });

      const { id, publicId } = await alice.duplicate(source.id);
      assert.notEqual(id, source.id);
      assert.notEqual(publicId, source.publicId);
      const copy = await client.expenseGroup.findUniqueOrThrow({
        where: { id },
        include: {
          budgets: true,
          bankAssignments: true,
          categories: { include: { expenses: true } },
          expenseSubmissions: true,
        },
      });
      assert.equal(copy.userId, "alice");
      assert.equal(publicId, copy.publicId);
      assert.deepEqual(await alice.resolveRoute(publicId), { id, publicId });
      assert.equal(copy.name, "Travel (copy)");
      assert.equal(await bob.getById(id), null);
      assert.deepEqual(await client.payLaterProviderAssignment.findMany({
        where: { expenseGroupId: id },
        select: { userId: true, providerKey: true, providerName: true, active: true, productEnabled: true },
        orderBy: { providerKey: "asc" },
      }), [
        { userId: "alice", providerKey: "custom:pay later provider", providerName: "Pay Later provider", active: true, productEnabled: false },
        { userId: "alice", providerKey: "shopee", providerName: null, active: false, productEnabled: true },
      ]);
      assert.equal(copy.expenseSubmissions.length, 0);
      assert.equal(copy.budgets.length, 1);
      assert.equal(copy.budgets[0].amountCentavos, 500_000);
      assert.equal(copy.budgets[0].description, "November trip");
      assert.deepEqual(copy.budgets[0].budgetMonth, budgetMonth);
      assert.equal(copy.bankAssignments.length, 1);
      const copiedBank = copy.bankAssignments[0];
      assert.notEqual(copiedBank.id, assignment.id);
      assert.equal(copiedBank.bankId, bank.id);
      assert.equal(copiedBank.active, false);
      assert.equal(copiedBank.supportedDebitCard, false);
      assert.equal(copiedBank.supportedCreditCard, true);
      assert.equal(copiedBank.supportedBankTransfer, false);
      assert.equal(copiedBank.supportedBankPayment, false);
      assert.equal(copy.categories.length, 2);
      const copiedCategory = copy.categories.find((row) => row.color === category.color);
      assert.ok(copiedCategory);
      assert.notEqual(copiedCategory.id, category.id);
      assert.equal(copiedCategory.icon, category.icon);
      assert.equal(copiedCategory.name, category.name);
      assert.equal(copiedCategory.expenses.length, 1);
      const copiedTicket = copiedCategory.expenses[0];
      assert.notEqual(copiedTicket.id, ticket.id);
      assert.equal(copiedTicket.expenseGroupId, id);
      assert.equal(copiedTicket.bankAssignmentId, copiedBank.id);
      assert.equal(copiedTicket.title, "Ticket");
      assert.equal(copiedTicket.merchant, "Travel agency");
      assert.equal(copiedTicket.amountCentavos, 115_042);
      assert.deepEqual(copiedTicket.date, date);
      assert.equal(copiedTicket.timeMinutes, 480);
      assert.equal(copiedTicket.notes, "Window seat");
      assert.equal(copiedTicket.paymentMethod, "CREDIT_CARD");
      const otherCategory = copy.categories.find((row) => row.color === null);
      assert.ok(otherCategory);
      assert.equal(otherCategory.name, "Travel");
      assert.equal(otherCategory.expenses.length, 1);
      const copiedLunch = otherCategory.expenses[0];
      assert.equal(copiedLunch.title, "Lunch");
      assert.equal(copiedLunch.merchant, null);
      assert.equal(copiedLunch.amountCentavos, 25_175);
      assert.equal(copiedLunch.bankAssignmentId, null);
      assert.equal(copiedLunch.legacyBankName, "Historical bank label");
      assert.equal(copiedLunch.paymentMethod, "PAY_LATER");
      assert.equal(copiedLunch.payLaterProviderKey, "custom:pay later provider");
      assert.equal(copiedLunch.payLaterProviderName, "Pay Later provider");
      assert.equal((await alice.getById(source.id))?.name, "Travel");
      assert.equal((await alice.getExpensePageById(source.id, 1))?.totalExpenses, 2);
    });

    await t.test("expense pages bound row counts and keep an exact full-group summary", async () => {
      const group = await alice.create("Paginated group");
      const empty = await alice.create("Empty pagination fixture");
      const category = await client.category.create({
        data: { expenseGroupId: group.id, name: "Travel", icon: "✈️" },
      });
      const bank = await client.bank.create({ data: { name: "Current bank", key: "current bank" } });
      const assignment = await client.bankAssignment.create({
        data: { expenseGroupId: group.id, bankId: bank.id },
      });
      const date = new Date("2026-10-24T00:00:00Z");
      const amountCentavos = 2_147_483_647;
      const expenses = await client.expense.createManyAndReturn({
        data: Array.from({ length: 26 }, (_, index) => ({
          expenseGroupId: group.id,
          categoryId: category.id,
          title: `Expense ${index + 1}`,
          merchant: index === 0 ? "Grab" : index === 4 ? "McDonald’s" : undefined,
          amountCentavos,
          date: index === 0 ? new Date("2026-10-25T00:00:00Z")
            : index === 2 ? new Date("2026-10-24T18:14:00Z") : date,
          timeMinutes: index === 1 ? 1435 : index === 3 ? 0 : null,
          legacyBankName: "Legacy bank",
          paymentMethod: "CASH",
          bankAssignmentId: index === 0 ? assignment.id : undefined,
        })),
        select: { id: true, title: true },
      });
      const sortedTitles = [1, 2, 4, 3, ...Array.from({ length: 22 }, (_, index) => 26 - index)];
      const idsByTitle = new Map(expenses.map(({ title, id }) => [title, id]));
      const expectedIds = sortedTitles.map((number) => idsByTitle.get(`Expense ${number}`));

      const first = await alice.getExpensePageById(group.id, 0);
      const last = await alice.getExpensePageById(group.id, Number.MAX_SAFE_INTEGER);
      assert.ok(first && last);
      assert.equal(first.page, 1);
      assert.equal(last.page, 2);
      for (const page of [first, last]) {
        assert.equal(page.totalExpenses, 26);
        assert.equal(page.totalPages, 2);
        assert.equal(page.totalCentavos, BigInt(amountCentavos) * BigInt(26));
      }
      assert.deepEqual(first.expenses.map(({ id }) => id), expectedIds.slice(0, 25));
      assert.deepEqual(last.expenses.map(({ id }) => id), expectedIds.slice(25));
      assert.equal(first.expenses[0].merchant, "Grab");
      assert.equal(first.expenses[1].merchant, null);
      assert.equal(last.expenses[0].merchant, "McDonald’s");
      assert.equal(first.expenses[1].timeMinutes, 1435);
      assert.equal(first.expenses[2].timeMinutes, 0);
      assert.equal(first.expenses[3].timeMinutes, null);
      assert.equal(first.expenses[0].daySummary, null);
      const groupedFirst = await alice.getExpensePageById(group.id, 1, {}, true);
      const groupedLast = await alice.getExpensePageById(group.id, 2, {}, true);
      assert.ok(groupedFirst && groupedLast);
      assert.deepEqual(groupedFirst.expenses.map(({ id }) => id), expectedIds.slice(0, 25));
      assert.deepEqual(groupedLast.expenses.map(({ id }) => id), expectedIds.slice(25));
      assert.equal(groupedFirst.expenses[0].merchant, "Grab");
      assert.equal(groupedFirst.expenses[1].merchant, null);
      assert.equal(groupedLast.expenses[0].merchant, "McDonald’s");
      assert.deepEqual(groupedFirst.expenses[0].daySummary, {
        count: 1, totalCentavos: BigInt(amountCentavos),
      });
      const otherDay = { count: 25, totalCentavos: BigInt(amountCentavos) * BigInt(25) };
      assert.deepEqual(groupedFirst.expenses[3].daySummary, otherDay);
      assert.deepEqual(groupedLast.expenses[0].daySummary, otherDay);
      assert.deepEqual(first.expenses[0].bankAssignment, { bank: { name: "Current bank" } });
      assert.deepEqual(last.expenses[0].date, date);
      assert.deepEqual(last.expenses[0].category, { name: "Travel", icon: "✈️" });
      assert.equal(last.expenses[0].legacyBankName, "Legacy bank");
      assert.equal(last.expenses[0].paymentMethod, "CASH");

      await client.expense.delete({ where: { id: last.expenses[0].id } });
      const clamped = await alice.getExpensePageById(group.id, 2);
      assert.equal(clamped?.page, 1);
      assert.equal(clamped.totalExpenses, 25);

      assert.deepEqual(await alice.getExpensePageById(empty.id, 2), {
        expenses: [],
        page: 1,
        totalPages: 1,
        totalExpenses: 0,
        totalCentavos: BigInt(0),
      });
      await client.expense.deleteMany({ where: { expenseGroupId: group.id } });
      await client.category.delete({ where: { id: category.id } });
      await client.bankAssignment.delete({ where: { id: assignment.id } });
      await client.bank.delete({ where: { id: bank.id } });
      await alice.delete(group.id);
      await alice.delete(empty.id);
    });

    await t.test("month and category filters apply to totals and every page", async () => {
      const group = await alice.create("Filtered history");
      const category = await client.category.create({
        data: { expenseGroupId: group.id, name: "Food" },
      });
      const otherCategory = await client.category.create({
        data: { expenseGroupId: group.id, name: "Transport" },
      });
      const foreignCategory = await client.category.findFirstOrThrow({
        where: { expenseGroupId: b.id },
      });
      const matches = await client.expense.createManyAndReturn({
        data: Array.from({ length: 26 }, (_, index) => ({
          expenseGroupId: group.id,
          categoryId: category.id,
          title: `Food expense ${index + 1}`,
          amountCentavos: 10,
          date: new Date(index === 0 ? "2026-10-01T00:00:00Z"
            : index === 1 ? "2026-10-31T00:00:00Z" : "2026-10-31T23:59:59.999Z"),
        })),
        select: { id: true, date: true },
      });
      await client.expense.createMany({
        data: [
          { title: "September expense", categoryId: category.id, date: new Date("2026-09-30T23:59:59.999Z") },
          { title: "November expense", categoryId: category.id, date: new Date("2026-11-01T00:00:00Z") },
          { title: "October transit", categoryId: otherCategory.id, date: new Date("2026-10-01T00:00:00Z") },
        ].map((expense) => ({ ...expense, expenseGroupId: group.id, amountCentavos: 25 })),
      });

      const filters = { month: "2026-10", categoryId: category.id };
      const first = await alice.getExpensePageById(group.id, 1, filters);
      const second = await alice.getExpensePageById(group.id, 2, filters);
      assert.ok(first && second);
      assert.equal(first.page, 1);
      assert.equal(second.page, 2);
      for (const page of [first, second]) {
        assert.equal(page.totalExpenses, 26);
        assert.equal(page.totalCentavos, BigInt(260));
        assert.equal(page.totalPages, 2);
      }
      assert.equal(first.expenses.length, 25);
      assert.equal(second.expenses.length, 1);
      const expectedIds = matches
        .sort((left, right) => right.date.getTime() - left.date.getTime() || right.id - left.id)
        .map(({ id }) => id);
      assert.deepEqual([...first.expenses, ...second.expenses].map(({ id }) => id), expectedIds);

      const dayFilters = { ...filters, month: "2026-11", day: "2026-10-31" };
      const dayPage = await alice.getExpensePageById(group.id, 1, dayFilters, true);
      assert.ok(dayPage);
      assert.deepEqual(dayPage.expenses.map(({ id }) => id), expectedIds.slice(0, 25));
      assert.equal(dayPage.totalCentavos, BigInt(250));
      assert.deepEqual(dayPage.expenses[0].daySummary, { count: 25, totalCentavos: BigInt(250) });
      assert.equal(await bob.getExpensePageById(group.id, 1, dayFilters), null);

      const invalidDay = await alice.getExpensePageById(group.id, 1, { ...filters, day: "2026-10-32" });
      assert.equal(invalidDay?.totalExpenses, 26);

      const throughFirstDay = await alice.getExpensePageById(group.id, 1, { ...filters, through: "2026-10-01" }, true);
      assert.equal(throughFirstDay?.totalExpenses, 1);
      assert.equal(throughFirstDay?.totalCentavos, BigInt(10));
      assert.equal(throughFirstDay?.expenses[0].id, expectedIds.at(-1));
      assert.equal(throughFirstDay?.expenses[0].daySummary?.totalCentavos, BigInt(10));

      const throughOtherMonth = await alice.getExpensePageById(group.id, 1, { ...filters, through: "2026-09-30" });
      assert.equal(throughOtherMonth?.totalExpenses, 26);

      const exactDayTakesPriority = await alice.getExpensePageById(
        group.id, 1, { ...filters, day: "2026-10-31", through: "2026-10-01" },
      );
      assert.equal(exactDayTakesPriority?.totalExpenses, 25);

      const monthOnly = await alice.getExpensePageById(group.id, 1, { month: filters.month });
      const categoryOnly = await alice.getExpensePageById(group.id, 1, { categoryId: filters.categoryId });
      assert.equal(monthOnly?.totalCentavos, BigInt(285));
      assert.equal(categoryOnly?.totalCentavos, BigInt(310));
      assert.deepEqual(await alice.getExpensePageById(group.id, 2, { categoryId: foreignCategory.id }), {
        expenses: [],
        page: 1,
        totalPages: 1,
        totalExpenses: 0,
        totalCentavos: BigInt(0),
      });
      assert.equal(await bob.getExpensePageById(group.id, 1, filters), null);

      await client.expense.update({
        where: { id: second.expenses[0].id },
        data: { categoryId: otherCategory.id },
      });
      const clamped = await alice.getExpensePageById(group.id, 2, filters);
      assert.equal(clamped?.page, 1);
      assert.equal(clamped.totalExpenses, 25);
      assert.equal(clamped.totalCentavos, BigInt(250));
      assert.equal(clamped.expenses.length, 25);

      await client.expense.deleteMany({ where: { expenseGroupId: group.id } });
      await client.category.deleteMany({ where: { expenseGroupId: group.id } });
      await alice.delete(group.id);
    });

    await t.test("exact merchant filters and labels stay private and preserve history totals", async () => {
      const group = await alice.create("Merchant filter group");
      const category = await client.category.create({ data: { expenseGroupId: group.id, name: "Transport" } });
      const date = new Date("2026-10-24T00:00:00Z");
      await client.expense.createMany({
        data: [
          ...Array.from({ length: 26 }, (_, index) => ({ merchant: index === 0 ? "Grab" : "grab", amountCentavos: 100 })),
          { merchant: "GrabFood", amountCentavos: 200 },
          { merchant: null, amountCentavos: 300 },
        ].map((expense, index) => ({ ...expense, expenseGroupId: group.id, categoryId: category.id, date, title: `Receipt ${index}` })),
      });

      const grab = createHash("sha256").update("grab").digest("hex");
      assert.equal((await alice.getExpenseHistoryMerchantLabel(group.id, grab))?.toLowerCase(), "grab");
      assert.equal(await bob.getExpenseHistoryMerchantLabel(group.id, grab), null);
      assert.equal(await bob.getExpensePageById(group.id, 1, { merchant: grab }), null);
      assert.equal(parseExpenseHistoryMerchantFilter("Grab"), undefined);
      assert.equal(parseExpenseHistoryMerchantFilter([grab]), undefined);

      const filters = { merchant: grab, day: "2026-10-24", categoryId: category.id };
      const first = await alice.getExpensePageById(group.id, 1, filters);
      const second = await alice.getExpensePageById(group.id, 2, filters, true);
      assert.equal(first?.expenses.length, 25);
      assert.equal(first?.totalExpenses, 26);
      assert.equal(first?.totalCentavos, BigInt(2600));
      assert.equal(second?.expenses.length, 1);
      assert.deepEqual(second?.expenses[0].daySummary, { count: 26, totalCentavos: BigInt(2600) });

      const missing = await alice.getExpensePageById(group.id, 1, { merchant: "none" });
      assert.equal(missing?.totalCentavos, BigInt(300));
      assert.deepEqual(missing?.expenses.map(({ merchant }) => merchant), [null]);
    });

    await t.test("expense search matches literal substrings in merchants or titles across pages", async () => {
      const group = await alice.create("Searchable merchants");
      const category = await client.category.create({ data: { expenseGroupId: group.id, name: "Shopping" } });
      await client.expense.createMany({
        data: [...Array.from({ length: 40 }, (_, index) => `Merchant ${String(index).padStart(2, "0")}`), "100%_Shop", null]
          .map((merchant) => ({
            expenseGroupId: group.id, categoryId: category.id, title: merchant === null ? "Merchant reimbursement" : "Receipt", merchant,
            amountCentavos: 100, date: new Date("2026-10-24T00:00:00Z"),
          })),
      });
      const filter = { search: " mErChAnT " };
      const second = await alice.getExpensePageById(group.id, 2, filter, true);
      assert.equal(second?.totalExpenses, 41);
      assert.equal(second?.expenses.length, 16);
      assert.deepEqual(second?.expenses[0].daySummary, { count: 41, totalCentavos: BigInt(4100) });
      const titleOnly = await alice.getExpensePageById(group.id, 1, { search: "REIMBURSE" });
      assert.deepEqual(titleOnly?.expenses.map(({ title, merchant }) => [title, merchant]), [["Merchant reimbursement", null]]);
      assert.equal((await alice.getExpensePageById(group.id, 1, { ...filter, day: "2026-10-25" }))?.totalExpenses, 0);
      const literal = await alice.getExpensePageById(group.id, 1, { search: "%_" });
      assert.deepEqual(literal?.expenses.map(({ merchant }) => merchant), ["100%_Shop"]);
      assert.equal((await alice.getExpensePageById(group.id, 1, { search: "no match" }))?.totalExpenses, 0);
      assert.equal(await bob.getExpensePageById(group.id, 1, filter), null);
    });

    await t.test("payment method and provider filters match historical rows, totals, and exports", async () => {
      const group = await alice.create("Payment history");
      const category = await client.category.create({
        data: { expenseGroupId: group.id, name: "Groceries" },
      });
      const otherCategory = await client.category.create({
        data: { expenseGroupId: group.id, name: "Transit" },
      });
      const bank = await client.bank.create({
        data: { name: "Retired history bank", key: "retired history bank", active: false },
      });
      const assignment = await client.bankAssignment.create({
        data: { expenseGroupId: group.id, bankId: bank.id, active: false },
      });
      const foreignAssignment = await client.bankAssignment.create({
        data: { expenseGroupId: b.id, bankId: bank.id },
      });
      const recordedName = "Older Bancó & Co.";
      const providerName = "Retired Pay Later shop";
      const providerKey = `custom:${providerName.toLowerCase()}`;
      const providerToken = `pay-later:${createHash("sha256").update(providerKey).digest("hex")}`;
      const legacyKey = createHash("sha256").update(recordedName).digest("hex");
      const assignmentToken = `assignment:${assignment.id}`;
      const legacyToken = `legacy:${legacyKey}`;
      const date = new Date("2026-10-24T00:00:00Z");
      const base = { expenseGroupId: group.id, categoryId: category.id, amountCentavos: 10, date };
      const linked = {
        ...base,
        paymentMethod: "DEBIT_CARD",
        bankAssignmentId: assignment.id,
        legacyBankName: recordedName,
      } as const;
      const matches = await client.expense.createManyAndReturn({
        data: Array.from({ length: 26 }, (_, index) => ({ ...linked, title: `Linked expense ${index + 1}` })),
        select: { id: true },
      });
      await client.expense.createMany({
        data: [
          { ...linked, title: "Other payment method", paymentMethod: "CREDIT_CARD", amountCentavos: 20 },
          { ...linked, title: "Other category", categoryId: otherCategory.id, amountCentavos: 30 },
          { ...linked, title: "Other month", date: new Date("2026-11-01T00:00:00Z"), amountCentavos: 40 },
          { ...base, title: "Legacy debit", legacyBankName: recordedName, paymentMethod: "DEBIT_CARD", amountCentavos: 50 },
          { ...base, title: "Legacy credit", legacyBankName: recordedName, paymentMethod: "CREDIT_CARD", amountCentavos: 60 },
          { ...base, title: "Blank legacy label", legacyBankName: " \t " },
          { ...base, title: "Historical Pay Later purchase", paymentMethod: "PAY_LATER", payLaterProviderKey: providerKey, payLaterProviderName: providerName },
          { ...base, title: "Other Pay Later purchase", paymentMethod: "PAY_LATER", payLaterProviderKey: "shopee" },
        ],
      });

      const bankFilter = parseExpenseHistoryBankFilter(assignmentToken);
      const paymentMethod = parseExpenseHistoryPaymentMethod("DEBIT_CARD");
      assert.deepEqual(bankFilter, { assignmentId: assignment.id });
      assert.equal(paymentMethod, "DEBIT_CARD");
      const filters = { month: "2026-10", categoryId: category.id, paymentMethod, bank: bankFilter };
      const first = await alice.getExpensePageById(group.id, 1, filters, true);
      const last = await alice.getExpensePageById(group.id, 999, filters, true);
      assert.ok(first && last);
      assert.deepEqual([first.page, last.page], [1, 2]);
      for (const page of [first, last]) {
        assert.equal(page.totalExpenses, 26);
        assert.equal(page.totalCentavos, BigInt(260));
        assert.equal(page.totalPages, 2);
        for (const expense of page.expenses) {
          assert.deepEqual(expense.daySummary, { count: 26, totalCentavos: BigInt(260) });
        }
      }
      assert.equal(first.expenses.length, 25);
      assert.equal(last.expenses.length, 1);
      const exactDay = await alice.getExpensePageById(group.id, 2, { ...filters, day: "2026-10-24" }, true);
      assert.deepEqual(exactDay, last);
      assert.deepEqual(
        [...first.expenses, ...last.expenses].map(({ id }) => id),
        matches.map(({ id }) => id).sort((left, right) => right - left),
      );

      assert.equal((await alice.getExpensePageById(group.id, 1, { paymentMethod }))?.totalCentavos, BigInt(380));
      assert.equal((await alice.getExpensePageById(group.id, 1, { bank: bankFilter }))?.totalCentavos, BigInt(350));
      const legacyFilter = parseExpenseHistoryBankFilter(legacyToken);
      assert.deepEqual(legacyFilter, { legacyKey });
      const historical = await alice.getExpensePageById(group.id, 1, { paymentMethod, bank: legacyFilter });
      assert.deepEqual(historical?.expenses.map(({ title }) => title), ["Legacy debit"]);
      assert.equal(historical?.totalCentavos, BigInt(50));

      assert.deepEqual(await alice.listExpenseHistoryProviderOptions(group.id), [
        { value: legacyToken, label: `${recordedName} (recorded name)`, paymentMethods: ["CREDIT_CARD", "DEBIT_CARD"] },
        { value: assignmentToken, label: bank.name, paymentMethods: ["CREDIT_CARD", "DEBIT_CARD"] },
        { value: providerToken, label: providerName, paymentMethods: ["PAY_LATER"] },
        { value: `pay-later:${createHash("sha256").update("shopee").digest("hex")}`, label: "SPayLater", paymentMethods: ["PAY_LATER"] },
      ]);
      const providerFilter = { payLaterProvider: parseExpenseHistoryPayLaterProviderFilter(providerToken) };
      const payLater = await alice.getExpensePageById(group.id, 1, providerFilter, true);
      assert.deepEqual(payLater?.expenses.map(({ title }) => title), ["Historical Pay Later purchase"]);
      assert.equal(payLater?.totalCentavos, BigInt(10));
      const exported = await alice.prepareExpenseExport(group.id, providerFilter);
      assert.ok(exported);
      const payments = [];
      for await (const batch of exported.batches()) {
        payments.push(...batch.map(({ title, paymentMethod, paymentProviderName }) => ({ title, paymentMethod, paymentProviderName })));
      }
      assert.deepEqual(payments, [{ title: "Historical Pay Later purchase", paymentMethod: "PAY_LATER", paymentProviderName: providerName }]);
      assert.deepEqual(await bob.listExpenseHistoryProviderOptions(group.id), []);
      assert.deepEqual(await alice.listExpenseHistoryProviderOptions(legacy.id), []);
      await assert.rejects(anonymous.listExpenseHistoryProviderOptions(group.id), /Sign in required/);
      assert.equal(await bob.getExpensePageById(group.id, 1, filters), null);
      assert.deepEqual(await alice.getExpensePageById(group.id, 2, { bank: { assignmentId: foreignAssignment.id } }), {
        expenses: [],
        page: 1,
        totalPages: 1,
        totalExpenses: 0,
        totalCentavos: BigInt(0),
      });

      await client.expense.deleteMany({ where: { expenseGroupId: group.id } });
      await client.category.deleteMany({ where: { expenseGroupId: group.id } });
      await client.bankAssignment.deleteMany({ where: { bankId: bank.id } });
      await client.bank.delete({ where: { id: bank.id } });
      await alice.delete(group.id);
    });

    await t.test("duplicating an empty group keeps the copy name within the limit", async () => {
      const prefix = "x".repeat(92);
      const source = await alice.create(prefix + "🚕123456");
      const { id } = await alice.duplicate(source.id);
      assert.equal((await alice.getById(id))?.name, prefix + " (copy)");
      assert.deepEqual((await alice.getExpensePageById(id, 1))?.expenses, []);
      await alice.delete(id);
      await alice.delete(source.id);
    });

    await t.test("bank catalog settings are private to their expense group and preserve history", async () => {
      const aliceBanks = createBankAccess(client, async () => "alice");
      const bobBanks = createBankAccess(client, async () => "bob");
      const anonymousBanks = createBankAccess(client, async () => {
        throw new Error("Sign in required");
      });
      const bank = await client.bank.create({ data: { name: "Tab Test Bank", key: "tab test bank" } });
      const retired = await client.bank.create({
        data: { name: "Retired Test Bank", key: "retired test bank", active: false },
      });
      await client.bankAssignment.create({ data: { expenseGroupId: legacy.id, bankId: bank.id } });
      const findBank = async (access = aliceBanks, groupId = a.id, bankId = bank.id) =>
        (await access.list(groupId)).find((entry) => entry.id === bankId);
      const settings = (groupId: number, bankId: number, ...checked: string[]) => {
        const data = new FormData();
        data.set("expenseGroupId", String(groupId));
        data.set("bankId", String(bankId));
        for (const field of checked) data.set(field, "on");
        return data;
      };
      const enableBank = settings(a.id, bank.id, "supportedDebitCard", "supportedBankTransfer");
      const unavailable = /This bank is unavailable for this expense group/;

      assert.equal((await findBank())?.assignment, null);
      assert.equal(await findBank(aliceBanks, a.id, retired.id), undefined);
      assert.deepEqual(await aliceBanks.list(legacy.id), []);
      assert.deepEqual(await bobBanks.list(a.id), []);
      await assert.rejects(anonymousBanks.list(a.id), /Sign in required/);
      await assert.rejects(anonymousBanks.save(enableBank), /Sign in required/);
      await assert.rejects(bobBanks.save(enableBank), unavailable);
      await assert.rejects(bobBanks.save(settings(a.id, bank.id)), unavailable);
      await assert.rejects(aliceBanks.save(settings(legacy.id, bank.id, "supportedDebitCard")), unavailable);
      await assert.rejects(aliceBanks.save(settings(a.id, retired.id, "supportedDebitCard")), unavailable);
      const invalid = settings(a.id, bank.id, "supportedDebitCard");
      invalid.set("supportedCreditCard", "false");
      await assert.rejects(aliceBanks.save(invalid), /settings are invalid/);
      await aliceBanks.save(settings(a.id, bank.id));
      assert.equal((await findBank())?.assignment, null);
      await aliceBanks.save(settings(a.id, bank.id, "active"));
      assert.equal((await findBank())?.assignment, null);

      await aliceBanks.save(enableBank);
      await aliceBanks.save(enableBank);
      const where = { expenseGroupId_bankId: { expenseGroupId: a.id, bankId: bank.id } };
      const assignment = await client.bankAssignment.findUniqueOrThrow({ where });
      assert.deepEqual((await findBank())?.assignment, {
        active: true,
        supportedDebitCard: true,
        supportedCreditCard: false,
        supportedBankTransfer: true,
        supportedBankPayment: false,
      });
      assert.equal((await findBank(bobBanks, b.id))?.assignment, null);
      assert.deepEqual(await aliceBanks.listForExpenses(a.id), [
        { id: assignment.id, name: bank.name, paymentMethods: ["DEBIT_CARD", "BANK_TRANSFER"] },
      ]);
      assert.deepEqual(await bobBanks.listForExpenses(a.id), []);
      assert.deepEqual(await bobBanks.listForExpenses(b.id), []);

      const expense = await client.expense.findFirstOrThrow({ where: { expenseGroupId: a.id } });
      await client.expense.update({ where: { id: expense.id }, data: { bankAssignmentId: assignment.id } });
      await aliceBanks.save(settings(a.id, bank.id));
      assert.deepEqual(await aliceBanks.listForExpenses(a.id), []);
      assert.deepEqual((await findBank())?.assignment, {
        active: false,
        supportedDebitCard: false,
        supportedCreditCard: false,
        supportedBankTransfer: false,
        supportedBankPayment: false,
      });
      assert.equal(
        (await alice.getExpensePageById(a.id, 1))?.expenses.find((row) => row.id === expense.id)?.bankAssignment?.bank.name,
        bank.name,
      );

      await aliceBanks.save(settings(a.id, bank.id, "supportedCreditCard"));
      assert.equal((await client.bankAssignment.findUniqueOrThrow({ where })).id, assignment.id);
      assert.equal((await findBank())?.assignment?.supportedDebitCard, false);
      await client.bank.update({ where: { id: bank.id }, data: { active: false } });
      assert.deepEqual(await aliceBanks.listForExpenses(a.id), []);
      assert.equal((await findBank())?.active, false);
      assert.equal(await findBank(bobBanks, b.id), undefined);
      await assert.rejects(aliceBanks.save(enableBank), unavailable);
      assert.equal((await findBank())?.assignment?.supportedCreditCard, true);
      await aliceBanks.save(settings(a.id, bank.id));
      assert.equal((await findBank())?.assignment?.active, false);
      assert.equal((await findBank())?.assignment?.supportedCreditCard, false);
    });

    await t.test("overview counts empty categories and sums large amounts without duplicating rows", async () => {
      const user = await client.user.create({
        data: { id: "overview", name: "Overview", email: "overview@example.test" },
      });
      const overview = createExpenseGroupAccess(client, async () => user.id);
      assert.deepEqual(await overview.list(), []);

      const populated = await client.expenseGroup.create({
        data: { name: "Populated", userId: user.id, createdAt: new Date("2026-10-01") },
      });
      const empty = await client.expenseGroup.create({
        data: { name: "Empty", userId: user.id, createdAt: new Date("2026-10-02") },
      });
      const category = await client.category.create({
        data: { name: "Populated category", expenseGroupId: populated.id },
      });
      await client.category.create({
        data: { name: "Empty category", expenseGroupId: populated.id },
      });
      await client.expense.createMany({
        data: ["First expense", "Second expense"].map((title) => ({
          title,
          amountCentavos: 2_147_483_647,
          date: new Date("2026-10-01"),
          categoryId: category.id,
          expenseGroupId: populated.id,
        })),
      });

      assert.deepEqual(await overview.list(), [
        {
          id: empty.id,
          publicId: empty.publicId,
          name: empty.name,
          categoryCount: BigInt(0),
          expenseCount: BigInt(0),
          totalCentavos: BigInt(0),
        },
        {
          id: populated.id,
          publicId: populated.publicId,
          name: populated.name,
          categoryCount: BigInt(2),
          expenseCount: BigInt(2),
          totalCentavos: BigInt(4_294_967_294),
        },
      ]);
    });
  } finally {
    await fixture.close();
  }
});
