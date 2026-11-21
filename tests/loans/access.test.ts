import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createExpenseGroupAccess } from "../../app/(dashboard)/_lib/expense-groups/access";
import { createExpenseAccess } from "../../app/(dashboard)/_lib/expenses/access";
import { createFinancialAccountAccess } from "../../app/(dashboard)/accounts/_lib/access";
import { createLoanAccess } from "../../app/lib/loans/access";
import { customPayLaterProviderKey, payLaterProviders } from "../../app/lib/loans/credit-products";
import { createTestDatabase } from "../helpers/database";

function form(entries: ReadonlyArray<readonly [string, string]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

function paymentDraft(allocations: { installmentId: string; amount: string }[], paidOn = "2026-12-15") {
  return form([
    ["submissionId", randomUUID()], ["paidOn", paidOn], ["fundingAccount", "Checking"],
    ...allocations.flatMap(({ installmentId, amount }): [string, string][] => [
      ["installmentId", installmentId], ["allocationAmount", amount],
    ]),
  ]);
}

test("Pay Later purchases require an enabled provider and an owned matching account", async () => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.createMany({ data: [
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
    ] });
    const groups = [];
    for (const [name, userId] of [["Household", "alice"], ["Travel", "alice"], ["Private", "bob"]]) {
      groups.push(await client.expenseGroup.create({
        data: { name, userId, categories: { create: { name: "Purchases" } } },
        include: { categories: true },
      }));
    }
    const [household, travel, privateGroup] = groups;
    const loans = createLoanAccess(client, async () => "alice");
    const otherLoans = createLoanAccess(client, async () => "bob");
    const expenses = createExpenseAccess(client, async () => "alice");
    const otherExpenses = createExpenseAccess(client, async () => "bob");
    const accounts = createFinancialAccountAccess(client, async () => "alice");
    const settings = (groupId: number, providerKey: string, active = true) => form([
      ["expenseGroupId", String(groupId)], ["providerKey", providerKey],
      ...(active ? [["active", "on"]] as const : []),
    ]);
    const financing = (id: string, providerKey = "shopee") => form([
      ["creditAccountId", id], ["creditProviderKey", providerKey],
      ["installmentDate", "2026-12-15"], ["installmentAmount", "100"],
    ]);
    const purchase = { title: "Purchase", amount: "100", date: "2026-11-20", paymentMethod: "PAY_LATER" };

    await assert.rejects(loans.setGroupCreditAccountSettings(settings(privateGroup.id, "shopee")), /expense groups/i);
    await assert.rejects(loans.setGroupCreditAccountSettings(settings(household.id, "custom:unknown")), /unavailable/i);
    await loans.setGroupCreditAccountSettings(settings(household.id, "shopee"));
    await loans.setGroupCreditAccountSettings(settings(household.id, "shopee"));
    assert.equal(await client.financialAccount.count(), 0);
    assert.equal(await client.expenseGroupPayLaterProvider.count(), 1);
    assert.deepEqual((await loans.getExpenseGroupPayLater(household.id)).providers.filter(({ active }) => active),
      [{ key: "shopee", name: "Shopee", active: true }]);
    assert.deepEqual((await loans.getExpenseGroupPayLater(household.id)).accounts, []);
    assert.deepEqual(await otherLoans.getExpenseGroupPayLater(household.id), { providers: [], accounts: [] });

    const { id } = await accounts.createPayLater(form([["name", "Personal installments"], ["providerKey", "shopee"]]));
    const secondary = await accounts.createPayLater(form([["name", "Other Shopee account"], ["providerKey", "shopee"]]));
    await loans.setGroupCreditAccountSettings(settings(household.id, "lazada"));
    await otherLoans.setGroupCreditAccountSettings(settings(privateGroup.id, "shopee"));
    assert.equal((await loans.getExpenseGroupPayLater(household.id)).accounts.length, 2);
    await assert.rejects(expenses.create(
      travel.id, travel.categories[0].id, purchase, randomUUID(), financing(id),
    ), /credit account is unavailable/i);
    await assert.rejects(expenses.create(
      household.id, household.categories[0].id, purchase, randomUUID(), financing(id, "lazada"),
    ), /credit account is unavailable/i);
    await assert.rejects(otherExpenses.create(
      privateGroup.id, privateGroup.categories[0].id, purchase, randomUUID(), financing(id),
    ), /credit account is unavailable/i);
    await assert.rejects(expenses.create(
      household.id, household.categories[0].id, purchase, randomUUID(), form([["creditAccountName", "Inline account"]]),
    ), /existing Pay Later account/i);
    assert.equal(await client.expense.count(), 0);
    assert.equal(await client.financialAccount.count(), 2);

    const draftId = randomUUID();
    const financed = await expenses.create(household.id, household.categories[0].id, purchase, draftId, financing(secondary.id));
    assert.equal((await expenses.create(household.id, household.categories[0].id, purchase, draftId, financing(secondary.id))).id, financed.id);
    const plan = await client.repaymentPlan.findUniqueOrThrow({ where: { expenseId: financed.id } });
    assert.equal(plan.creditAccountId, secondary.id);
    await loans.setGroupCreditAccountSettings(settings(household.id, "shopee", false));
    assert.equal((await loans.getRepaymentPlan(plan.id))?.creditAccount.name, "Other Shopee account");
    await assert.rejects(expenses.create(
      household.id, household.categories[0].id, purchase, randomUUID(), financing(id),
    ), /credit account is unavailable/i);
    assert.equal(await client.expense.count(), 1);

    const customName = "Local Store";
    const customKey = customPayLaterProviderKey(customName);
    await accounts.createPayLater(form([["name", "Store installments"], ["providerKey", "other"], ["providerName", customName]]));
    await loans.setGroupCreditAccountSettings(settings(travel.id, customKey));
    assert.deepEqual((await loans.getExpenseGroupPayLater(travel.id)).providers.filter(({ active }) => active),
      [{ key: customKey, name: customName, active: true }]);
    const customAccount = (await accounts.list()).find(({ name }) => name === "Store installments")!;
    await accounts.remove(customAccount.id);
    assert.deepEqual((await loans.getExpenseGroupPayLater(travel.id)).providers.filter(({ active }) => active),
      [{ key: customKey, name: customName, active: true }]);
  } finally {
    await fixture.close();
  }
});

test("every preset can be enabled without creating a financial account", async () => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.create({ data: { id: "alice", name: "Alice", email: "alice@example.test" } });
    const { id } = await client.expenseGroup.create({ data: { name: "Household", userId: "alice" } });
    const { id: otherId } = await client.expenseGroup.create({ data: { name: "Travel", userId: "alice" } });
    const loans = createLoanAccess(client, async () => "alice");
    for (const { key } of payLaterProviders) {
      await loans.setGroupCreditAccountSettings(form([["expenseGroupId", String(id)], ["providerKey", key], ["active", "on"]]));
    }
    assert.equal((await loans.getExpenseGroupPayLater(id)).providers.filter(({ active }) => active).length, payLaterProviders.length);
    assert.equal((await loans.getExpenseGroupPayLater(otherId)).providers.filter(({ active }) => active).length, 0);
    assert.equal(await client.financialAccount.count(), 0);
  } finally {
    await fixture.close();
  }
});

test("cash loans and existing repayment plans stay private and payable one obligation at a time", async () => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.createMany({ data: [
      { id: "alice", name: "Alice", email: "alice@example.test" },
      { id: "bob", name: "Bob", email: "bob@example.test" },
    ] });
    const group = await client.expenseGroup.create({
      data: { name: "Renovation", userId: "alice", categories: { create: { name: "Tools" } } },
      include: { categories: true },
    });
    const otherGroup = await client.expenseGroup.create({ data: { name: "Private group", userId: "bob" } });
    // December 15 has already started in Manila, while UTC is still December 14.
    const now = () => new Date("2026-12-14T16:05:00Z");
    const loans = createLoanAccess(client, async () => "alice", now);
    const otherLoans = createLoanAccess(client, async () => "bob", now);
    const cashDraft = form([
      ["submissionId", randomUUID()], ["title", "Renovation cash loan"], ["lender", "Example Bank"],
      ["amount", "2000"], ["disbursementDate", "2026-11-20"], ["receivingAccount", "Checking"],
      ["repaymentFrequency", "Monthly"], ["installmentDate", "2026-12-20"], ["installmentAmount", "2000"],
      ["expenseGroupId", String(otherGroup.id)],
    ]);
    await assert.rejects(loans.createCashLoan(cashDraft), /expense groups/i);
    cashDraft.set("expenseGroupId", String(group.id));
    const { id: loanId } = await loans.createCashLoan(cashDraft);
    assert.equal((await loans.createCashLoan(cashDraft)).id, loanId);
    assert.equal(await otherLoans.getCashLoan(loanId), null);
    assert.deepEqual((await loans.getCashLoans()).map(({ id }) => id), [loanId]);
    assert.deepEqual(await otherLoans.getCashLoans(), []);
    assert.deepEqual((await loans.getCashLoansForExpenseGroup(group.id)).map(({ id }) => id), [loanId]);
    assert.equal(await client.loan.count(), 1);

    const account = await client.payLaterAccount.create({
      data: { userId: "alice", name: "SPayLater", key: "spaylater", providerKey: "shopee" },
    });
    async function seedExistingPurchase(title: string, amountCentavos: number) {
      const expense = await client.expense.create({
        data: {
          title, amountCentavos, date: new Date("2026-11-22T13:00:00Z"), paymentMethod: "PAY_LATER",
          expenseGroupId: group.id, categoryId: group.categories[0].id,
          repaymentPlan: { create: {
            creditAccountId: account.id,
            installments: { create: { dueDate: new Date("2026-12-15"), amountCentavos } },
          } },
        },
        include: { repaymentPlan: { include: { installments: true } } },
      });
      assert.ok(expense.repaymentPlan);
      return expense.repaymentPlan;
    }
    const sprayer = await seedExistingPurchase("Paint sprayer", 120000);
    const drill = await seedExistingPurchase("Drill set", 45000);
    const sprayerInstallment = sprayer.installments[0].id;
    const drillInstallment = drill.installments[0].id;
    const existingPayment = await client.loanPayment.create({
      data: {
        userId: "alice", submissionId: randomUUID(), payloadHash: "legacy-provider-bill",
        paidOn: new Date("2026-12-01"), fundingAccount: "Wallet", amountCentavos: 25000,
        allocations: { create: [
          { installmentId: sprayerInstallment, amountCentavos: 20000 },
          { installmentId: drillInstallment, amountCentavos: 5000 },
        ] },
      },
    });

    assert.equal(await otherLoans.getRepaymentPlan(sprayer.id), null);
    const historicPlan = await loans.getRepaymentPlan(sprayer.id);
    assert.equal(historicPlan?.creditAccount.name, "SPayLater");
    assert.equal(historicPlan?.expense.title, "Paint sprayer");
    assert.equal(historicPlan?.installments[0].allocations[0].payment.id, existingPayment.id);
    assert.equal(historicPlan?.installments[0].allocations[0].amountCentavos, 20000);
    const secondHistoricPlan = await loans.getRepaymentPlan(drill.id);
    assert.equal(secondHistoricPlan?.installments[0].allocations[0].payment.id, existingPayment.id);
    assert.equal(secondHistoricPlan?.installments[0].allocations[0].amountCentavos, 5000);

    await assert.rejects(loans.recordLoanPayment(paymentDraft([
      { installmentId: sprayerInstallment, amount: "1000" },
      { installmentId: drillInstallment, amount: "400" },
    ])), /single loan or repayment plan/i);
    const cashLoan = await loans.getCashLoan(loanId);
    assert.ok(cashLoan);
    const cashInstallment = cashLoan.installments[0].id;
    await assert.rejects(loans.recordLoanPayment(paymentDraft([
      { installmentId: cashInstallment, amount: "500" },
      { installmentId: sprayerInstallment, amount: "1000" },
    ])), /single loan or repayment plan/i);
    for (const [installmentId, dayBeforeStart] of [[cashInstallment, "2026-11-19"], [sprayerInstallment, "2026-11-21"]]) {
      const allocations = [{ installmentId, amount: "1" }];
      await assert.rejects(loans.recordLoanPayment(paymentDraft(allocations, dayBeforeStart)), /cannot precede/i);
      await assert.rejects(loans.recordLoanPayment(paymentDraft(allocations, "2026-12-16")), /cannot be in the future/i);
    }
    assert.equal(await client.loanPayment.count(), 1);

    const planDraft = paymentDraft([{ installmentId: sprayerInstallment, amount: "1000" }]);
    await assert.rejects(otherLoans.recordLoanPayment(planDraft), /unavailable/i);
    const payment = await loans.recordLoanPayment(planDraft);
    assert.equal((await loans.recordLoanPayment(planDraft)).id, payment.id);
    await assert.rejects(loans.recordLoanPayment(paymentDraft([
      { installmentId: sprayerInstallment, amount: "0.01" },
    ])), /remaining balance/i);
    const updatedPlan = await loans.getRepaymentPlan(sprayer.id);
    assert.deepEqual(updatedPlan?.installments[0].allocations.map(({ amountCentavos }) => amountCentavos), [20000, 100000]);
    assert.equal(updatedPlan?.installments[0].allocations[1].payment.paidOn.toISOString(), "2026-12-15T00:00:00.000Z");
    assert.equal(await client.repaymentPlan.count(), 2);
    assert.equal(await client.expense.count(), 2);

    // A repayment on the purchase's stored calendar day is valid despite the legacy timestamp.
    const drillPayment = paymentDraft([{ installmentId: drillInstallment, amount: "1" }], "2026-11-22");
    assert.ok((await loans.recordLoanPayment(drillPayment)).id);
    assert.equal((await loans.getRepaymentPlan(drill.id))?.installments[0].allocations[0].payment.paidOn.toISOString(), "2026-11-22T00:00:00.000Z");

    const cashPayment = paymentDraft([{ installmentId: cashInstallment, amount: "500" }], "2026-11-20");
    assert.ok((await loans.recordLoanPayment(cashPayment)).id);
    const cashAllocation = (await loans.getCashLoan(loanId))?.installments[0].allocations[0];
    assert.equal(cashAllocation?.amountCentavos, 50000);
    assert.equal(cashAllocation?.payment.paidOn.toISOString(), "2026-11-20T00:00:00.000Z");

    const expenseGroups = createExpenseGroupAccess(client, async () => "alice");
    const emptyGroup = await client.expenseGroup.create({ data: { name: "Empty group", userId: "alice" } });
    cashDraft.set("expenseGroupId", String(emptyGroup.id));
    cashDraft.set("submissionId", randomUUID());
    const secondLoan = await loans.createCashLoan(cashDraft);
    await expenseGroups.delete(emptyGroup.id);
    assert.equal((await loans.getCashLoan(secondLoan.id))?.expenseGroupId, null);
  } finally {
    await fixture.close();
  }
});
