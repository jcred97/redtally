import assert from "node:assert/strict";
import test from "node:test";
import { createPayLaterAccess, requireEnabledPayLaterProvider } from "../../app/lib/pay-later/access";
import { presetPayLaterProviders } from "../../app/lib/pay-later/providers";
import { createTestDatabase } from "../helpers/database";

function providerForm(expenseGroupId: number, fields: Record<string, string>) {
  const form = new FormData();
  form.set("expenseGroupId", String(expenseGroupId));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

test("Pay Later provider settings and purchase eligibility are scoped to the group owner", async (context) => {
  const { client, close } = await createTestDatabase();
  context.after(close);
  await client.user.createMany({
    data: [
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
    ],
  });
  const household = await client.expenseGroup.create({ data: { name: "Household", userId: "alice" } });
  const travel = await client.expenseGroup.create({ data: { name: "Travel", userId: "alice" } });
  const { getExpenseGroupPayLater, setGroupPayLaterProvider, createGroupPayLaterProvider } = createPayLaterAccess(client);
  const enableShopee = providerForm(household.id, { providerKey: "shopee", active: "on" });
  const resolveProvider = (userId: string, groupId: number, key: unknown) => client.$transaction(
    (tx) => requireEnabledPayLaterProvider(tx, userId, groupId, key),
  );

  assert.deepEqual(await getExpenseGroupPayLater("alice", household.id), {
    providers: presetPayLaterProviders.map((provider) => ({ ...provider, active: false })),
  });
  assert.deepEqual(await getExpenseGroupPayLater("bob", household.id), { providers: [] });
  await assert.rejects(setGroupPayLaterProvider("bob", enableShopee), /expense groups/i);
  await assert.rejects(resolveProvider("alice", household.id, null), /choose a credit provider/i);
  await assert.rejects(resolveProvider("alice", household.id, "shopee"), /unavailable/i);

  await setGroupPayLaterProvider("alice", enableShopee);
  await setGroupPayLaterProvider("alice", enableShopee);
  assert.deepEqual(await resolveProvider("alice", household.id, "shopee"), { providerKey: "shopee", providerName: null });
  assert.equal(await client.payLaterProviderAssignment.count(), 1);
  await assert.rejects(resolveProvider("bob", household.id, "shopee"), /unavailable/i);
  await assert.rejects(resolveProvider("alice", travel.id, "shopee"), /unavailable/i);

  const createCustom = providerForm(household.id, { name: "  Local   Store  " });
  await assert.rejects(createGroupPayLaterProvider("bob", createCustom), /expense groups/i);
  await assert.rejects(createGroupPayLaterProvider("alice", providerForm(household.id, { name: " Shopee " })), /settings list/i);
  await assert.rejects(setGroupPayLaterProvider("alice", providerForm(household.id, { providerKey: "custom:missing", active: "on" })), /unavailable/i);
  await createGroupPayLaterProvider("alice", createCustom);
  await createGroupPayLaterProvider("alice", providerForm(household.id, { name: "local store" }));
  assert.deepEqual(await resolveProvider("alice", household.id, "custom:local store"), {
    providerKey: "custom:local store",
    providerName: "Local Store",
  });
  assert.deepEqual((await getExpenseGroupPayLater("alice", household.id)).providers.filter(({ active }) => active), [
    { providerKey: "shopee", providerName: "Shopee", active: true },
    { providerKey: "custom:local store", providerName: "Local Store", active: true },
  ]);

  await setGroupPayLaterProvider("alice", providerForm(household.id, { providerKey: "shopee" }));
  await setGroupPayLaterProvider("alice", providerForm(household.id, { providerKey: "custom:local store" }));
  await assert.rejects(resolveProvider("alice", household.id, "shopee"), /unavailable/i);
  await assert.rejects(resolveProvider("alice", household.id, "custom:local store"), /unavailable/i);
  assert.equal((await getExpenseGroupPayLater("alice", household.id)).providers.some(({ active }) => active), false);
});
