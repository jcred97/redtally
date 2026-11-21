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
    assert.equal(await client.financialAccount.count(), 0);

    const savings = draft({ name: "  BPI Savings  ", currency: "php", bankId: String(bank.id), userId: "bob" });
    const { id } = await alice.create(savings);
    assert.deepEqual(await alice.create(savings), { id });
    await assert.rejects(bob.create(savings), /draft could not be saved/);
    assert.deepEqual(await bob.list(), []);

    savings.set("currency", "USD");
    await assert.rejects(alice.create(savings), /draft could not be saved/);
    await bob.create(draft({ name: "Bob's wallet", type: "WALLET", currency: "USD" }));
    const provider = await client.payLaterAccount.create({
      data: { userId: "alice", name: "SPayLater", key: "spaylater", enabled: false },
      select: { financialAccount: { select: { id: true } } },
    });
    assert.ok(provider.financialAccount);

    assert.deepEqual(await alice.list(), [
      { id, name: "BPI Savings", type: "SAVINGS", currency: "PHP", bank: { name: bank.name } },
      { id: provider.financialAccount.id, name: "SPayLater", type: "PAY_LATER", currency: "PHP", bank: null },
    ]);
    assert.deepEqual((await bob.list()).map(({ name, currency }) => ({ name, currency })), [
      { name: "Bob's wallet", currency: "USD" },
    ]);
  } finally {
    await fixture.close();
  }
});
