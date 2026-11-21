import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createFinancialAccountAccess } from "../../app/(dashboard)/accounts/_lib/access";
import { createTestDatabase } from "../helpers/database";

function draft(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    accountId: randomUUID(),
    name: "Everyday savings",
    type: "SAVINGS",
    currency: "PHP",
    ...fields,
  })) {
    form.set(key, value);
  }
  return form;
}

test("financial account registry scopes owners, validates new accounts, and safely retries a draft", async () => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.createMany({
      data: [
        { id: "alice", name: "Alice", email: "alice@example.test" },
        { id: "bob", name: "Bob", email: "bob@example.test" },
      ],
    });
    const alice = createFinancialAccountAccess(client, async () => "alice");
    const bob = createFinancialAccountAccess(client, async () => "bob");
    const anonymous = createFinancialAccountAccess(client, async () => { throw new Error("Sign in required"); });
    const bank = await client.bank.findUniqueOrThrow({ where: { key: "bpi" } });
    const inactive = await client.bank.create({
      data: { name: "Inactive fixture bank", key: "inactive fixture bank", active: false },
    });

    await assert.rejects(anonymous.list(), /Sign in required/);
    await assert.rejects(anonymous.listBanks(), /Sign in required/);
    await assert.rejects(anonymous.create(draft({ accountId: "invalid" })), /Sign in required/);
    await assert.rejects(anonymous.createPayLater(draft({ type: "PAY_LATER" })), /Sign in required/);
    const banks = await alice.listBanks();
    assert.ok(banks.some(({ id }) => id === bank.id));
    assert.ok(!banks.some(({ id }) => id === inactive.id));

    for (const [fields, error] of [
      [{ accountId: "bad" }, /identify this draft/],
      [{ name: " " }, /account name/i],
      [{ type: "PAY_LATER" }, /account type/],
      [{ currency: "ZZZ" }, /currency code/],
      [{ bankId: "-1" }, /valid bank/],
      [{ type: "WALLET", bankId: String(bank.id) }, /valid bank/],
      [{ bankId: String(inactive.id) }, /available bank/],
    ] as const) {
      await assert.rejects(alice.create(draft(fields)), error);
    }
    await assert.rejects(alice.createPayLater(draft({ type: "PAY_LATER", providerKey: "invalid" })), /credit provider/i);
    await assert.rejects(alice.createPayLater(draft({ type: "PAY_LATER", providerKey: "other", providerName: " " })), /custom provider name/i);
    assert.equal(await client.financialAccount.count(), 0);

    const savings = draft({ name: "  BPI Savings  ", currency: "php", bankId: String(bank.id), userId: "bob" });
    const { id } = await alice.create(savings);
    assert.deepEqual(await alice.create(savings), { id });
    await assert.rejects(bob.create(savings), /draft could not be saved/);
    assert.deepEqual(await bob.list(), []);

    savings.set("currency", "USD");
    await assert.rejects(alice.create(savings), /draft could not be saved/);
    await bob.create(draft({ name: "Bob's wallet", type: "WALLET", currency: "USD" }));
    const { id: providerId } = await alice.createPayLater(draft({ name: "Shopee purchases", type: "PAY_LATER", providerKey: "shopee" }));
    const retry = await alice.createPayLater(draft({ name: "  shopee   purchases  ", type: "PAY_LATER", providerKey: "shopee" }));
    assert.equal(retry.id, providerId);
    await assert.rejects(alice.createPayLater(draft({ name: "Shopee purchases", type: "PAY_LATER", providerKey: "lazada" })), /provider/i);
    const provider = await client.payLaterAccount.findUniqueOrThrow({
      where: { id: providerId },
      select: { financialAccount: { select: { id: true } } },
    });
    assert.ok(provider.financialAccount);
    const { id: customId } = await alice.createPayLater(draft({
      name: "Weekend purchases", type: "PAY_LATER", providerKey: "other", providerName: "  Store   installments  ",
    }));
    const custom = await client.payLaterAccount.findUniqueOrThrow({
      where: { id: customId },
      select: { financialAccount: { select: { id: true } } },
    });
    assert.ok(custom.financialAccount);

    assert.deepEqual(await alice.list(), [
      { id, name: "BPI Savings", type: "SAVINGS", currency: "PHP", bank: { name: bank.name }, payLaterAccount: null },
      { id: provider.financialAccount.id, name: "Shopee purchases", type: "PAY_LATER", currency: "PHP", bank: null,
        payLaterAccount: { providerKey: "shopee", providerName: null } },
      { id: custom.financialAccount.id, name: "Weekend purchases", type: "PAY_LATER", currency: "PHP", bank: null,
        payLaterAccount: { providerKey: "custom:store installments", providerName: "Store installments" } },
    ]);
    assert.deepEqual((await bob.list()).map(({ name, currency }) => ({ name, currency })), [
      { name: "Bob's wallet", currency: "USD" },
    ]);
  } finally {
    await fixture.close();
  }
});

test("account edits are owner-scoped and deletion preserves financed purchases", async () => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.createMany({ data: [
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
    ] });
    const alice = createFinancialAccountAccess(client, async () => "alice");
    const bob = createFinancialAccountAccess(client, async () => "bob");
    const { id } = await alice.create(draft());

    await assert.rejects(bob.rename(id, draft()), /Account not found/);
    await assert.rejects(bob.remove(id), /Account not found/);
    await assert.rejects(alice.rename(id, draft({ name: " " })), /account name/i);
    await alice.rename(id, draft({ name: "  Emergency savings  " }));
    assert.equal((await alice.list())[0].name, "Emergency savings");
    await alice.remove(id);
    assert.deepEqual(await alice.list(), []);

    const group = await client.expenseGroup.create({
      data: { userId: "alice", name: "Household", categories: { create: { name: "Shopping" } } },
      include: { categories: true },
    });
    for (const withPurchase of [true, false]) {
      const provider = await client.payLaterAccount.create({
        data: { userId: "alice", name: "Example provider", key: String(withPurchase), providerKey: "shopee" },
        include: { financialAccount: true },
      });
      assert.ok(provider.financialAccount);
      const financialId = provider.financialAccount.id;
      await client.creditAccountAssignment.create({
        data: { userId: "alice", expenseGroupId: group.id, creditAccountId: provider.id },
      });
      await alice.rename(financialId, draft({ name: "Household Pay Later" }));
      assert.equal((await client.payLaterAccount.findUniqueOrThrow({ where: { id: provider.id } })).name, "Example provider");

      if (withPurchase) {
        await client.expense.create({
          data: {
            expenseGroupId: group.id, categoryId: group.categories[0].id,
            title: "Cookware", amountCentavos: 120000, date: new Date("2026-11-21"), paymentMethod: "PAY_LATER",
            repaymentPlan: { create: { creditAccountId: provider.id } },
          },
        });
        await assert.rejects(alice.remove(financialId), /linked records/);
        assert.ok(await client.financialAccount.findUnique({ where: { id: financialId } }));
        assert.equal(await client.repaymentPlan.count({ where: { creditAccountId: provider.id } }), 1);
        assert.equal(await client.creditAccountAssignment.count({ where: { creditAccountId: provider.id } }), 1);
      } else {
        await alice.remove(financialId);
        assert.equal(await client.financialAccount.findUnique({ where: { id: financialId } }), null);
        assert.equal(await client.payLaterAccount.findUnique({ where: { id: provider.id } }), null);
        assert.equal(await client.creditAccountAssignment.count({ where: { creditAccountId: provider.id } }), 0);
      }
    }
  } finally {
    await fixture.close();
  }
});
