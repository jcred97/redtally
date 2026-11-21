import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createExpenseGroupAccess } from "../../app/(dashboard)/_lib/expense-groups/access";
import { createExpenseAccess } from "../../app/(dashboard)/_lib/expenses/access";
import { createFinancialAccountAccess } from "../../app/(dashboard)/accounts/_lib/access";
import { createLoanAccess } from "../../app/lib/loans/access";
import { creditProducts, spayLaterProduct } from "../../app/lib/loans/credit-products";
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

test("Pay Later providers and financing are scoped to the selected expense group", async () => {
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
    const settings = (expenseGroupId: number, active: boolean) => form([
      ["expenseGroupId", String(expenseGroupId)], ["productKey", "spaylater"],
      ...(active ? [["active", "on"], ["supportsPayLater", "on"]] as const : []),
    ]);
    const financing = (field: "creditAccountId" | "creditAccountName", value: string) => form([
      [field, value], ["installmentDate", "2026-12-15"], ["installmentAmount", "100"],
    ]);
    const purchase = { title: "Purchase", amount: "100", date: "2026-11-20", paymentMethod: "PAY_LATER" };

    await assert.rejects(loans.setGroupCreditAccountSettings(settings(privateGroup.id, true)), /expense groups/i);
    await assert.rejects(loans.setGroupCreditAccountSettings(form([
      ["expenseGroupId", String(household.id)], ["productKey", "spaylater"], ["active", "on"],
    ])), /credit method/i);
    assert.equal(await client.payLaterAccount.count(), 0);

    const { id } = await loans.setGroupCreditAccountSettings(settings(household.id, true));
    assert.equal((await loans.setGroupCreditAccountSettings(settings(household.id, true))).id, id);
    assert.deepEqual(await client.financialAccount.findMany({
      where: { payLaterAccountId: id },
      select: { name: true, userId: true, type: true, currency: true },
    }), [{ name: "SPayLater", userId: "alice", type: "PAY_LATER", currency: "PHP" }]);
    assert.deepEqual(await loans.getEnabledCreditAccounts(household.id), [{ id, name: "SPayLater" }]);
    assert.deepEqual(await loans.getEnabledCreditAccounts(travel.id), []);
    assert.deepEqual(await otherLoans.getCreditAccountSettings(household.id), []);
    assert.deepEqual(await otherLoans.getEnabledCreditAccounts(household.id), []);
    await assert.rejects(otherLoans.setGroupCreditAccountSettings(form([
      ["expenseGroupId", String(privateGroup.id)], ["creditAccountId", id],
      ["active", "on"], ["supportsPayLater", "on"],
    ])), /credit account is unavailable/i);

    await assert.rejects(expenses.create(
      travel.id, travel.categories[0].id, purchase, randomUUID(), financing("creditAccountId", id),
    ), /credit account is unavailable/i);
    await assert.rejects(otherExpenses.create(
      privateGroup.id, privateGroup.categories[0].id, purchase, randomUUID(), financing("creditAccountId", id),
    ), /credit account is unavailable/i);
    assert.equal(await client.expense.count(), 0);

    const financed = await expenses.create(
      household.id, household.categories[0].id, purchase, randomUUID(), financing("creditAccountId", id),
    );
    const plan = await client.repaymentPlan.findUniqueOrThrow({ where: { expenseId: financed.id } });
    await loans.setGroupCreditAccountSettings(settings(household.id, false));
    assert.deepEqual(await loans.getEnabledCreditAccounts(household.id), []);
    assert.equal((await loans.getRepaymentPlan(plan.id))?.creditAccount.name, "SPayLater");
    await assert.rejects(expenses.create(
      household.id, household.categories[0].id, purchase, randomUUID(), financing("creditAccountId", id),
    ), /credit account is unavailable/i);
    assert.equal(await client.expense.count(), 1);

    const customDraftId = randomUUID();
    const customPurchase = await expenses.create(
      travel.id, travel.categories[0].id, purchase, customDraftId, financing("creditAccountName", "Example Pay Later"),
    );
    assert.equal((await expenses.create(
      travel.id, travel.categories[0].id, purchase, customDraftId, financing("creditAccountName", "Example Pay Later"),
    )).id, customPurchase.id);
    const [customAccount] = await loans.getEnabledCreditAccounts(travel.id);
    assert.equal(customAccount.name, "Example Pay Later");
    assert.deepEqual(await client.financialAccount.findMany({
      where: { payLaterAccountId: customAccount.id },
      select: { name: true, userId: true, type: true, currency: true },
    }), [{ name: "Example Pay Later", userId: "alice", type: "PAY_LATER", currency: "PHP" }]);
    assert.deepEqual(await loans.getEnabledCreditAccounts(household.id), []);
    assert.deepEqual(
      (await loans.getCreditAccountSettings(travel.id)).find((account) => account.id === customAccount.id)?.assignment,
      { active: true, supportsPayLater: true },
    );

    const accounts = createFinancialAccountAccess(client, async () => "alice");
    await assert.rejects(accounts.createPayLater(form([["name", "  "]])), /account name/i);
    assert.equal(await client.payLaterAccount.count(), 2);
    const configured = await accounts.createPayLater(form([["name", " Store installments "]]));
    assert.equal((await accounts.createPayLater(form([["name", "store   installments"]]))).id, configured.id);
    assert.ok((await accounts.list()).some(({ name, type }) => name === "Store installments" && type === "PAY_LATER"));
    assert.deepEqual(await loans.getEnabledCreditAccounts(household.id), []);

    const customSettings = (expenseGroupId: number) => form([
      ["expenseGroupId", String(expenseGroupId)], ["creditAccountId", configured.id], ["active", "on"], ["supportsPayLater", "on"],
    ]);
    await assert.rejects(loans.setGroupCreditAccountSettings(customSettings(privateGroup.id)), /expense groups/i);
    await loans.setGroupCreditAccountSettings(customSettings(household.id));
    assert.deepEqual(await loans.getEnabledCreditAccounts(household.id), [{ id: configured.id, name: "Store installments" }]);
    assert.deepEqual(await loans.getEnabledCreditAccounts(travel.id), [customAccount]);
    const configuredPurchase = await expenses.create(
      household.id, household.categories[0].id, purchase, randomUUID(), financing("creditAccountId", configured.id),
    );
    assert.equal((await client.repaymentPlan.findUniqueOrThrow({
      where: { expenseId: configuredPurchase.id },
    })).creditAccountId, configured.id);
  } finally {
    await fixture.close();
  }
});

test("Pay Later presets opt in per group and reuse a matching custom provider", async () => {
  const fixture = await createTestDatabase();
  const { client } = fixture;
  try {
    await client.user.create({ data: { id: "alice", name: "Alice", email: "alice@example.test" } });
    const { id: expenseGroupId, categories } = await client.expenseGroup.create({
      data: { name: "Household", userId: "alice", categories: { create: { name: "Purchases" } } },
      include: { categories: true },
    });
    const otherGroup = await client.expenseGroup.create({ data: { name: "Travel", userId: "alice" } });
    const loans = createLoanAccess(client, async () => "alice");
    const expenses = createExpenseAccess(client, async () => "alice");
    const purchase = await expenses.create(
      expenseGroupId, categories[0].id,
      { title: "Purchase", amount: "100", date: "2026-11-20", paymentMethod: "PAY_LATER" },
      randomUUID(),
      form([["creditAccountName", "ATOME CARD"], ["installmentDate", "2026-12-15"], ["installmentAmount", "100"]]),
    );
    const { creditAccountId } = await client.repaymentPlan.findUniqueOrThrow({ where: { expenseId: purchase.id } });
    await client.financialAccount.update({
      where: { payLaterAccountId_userId: { payLaterAccountId: creditAccountId, userId: "alice" } },
      data: { name: "My Atome Card" },
    });

    const presets = creditProducts.filter(({ key }) => key !== spayLaterProduct.key);
    for (const { key, name } of presets) {
      const settings = form([
        ["expenseGroupId", String(expenseGroupId)], ["productKey", key], ["active", "on"], ["supportsPayLater", "on"],
      ]);
      const { id } = await loans.setGroupCreditAccountSettings(settings);
      assert.equal((await loans.setGroupCreditAccountSettings(settings)).id, id);
      const provider = await client.payLaterAccount.findUniqueOrThrow({ where: { id }, include: { financialAccount: true } });
      assert.equal(provider.key, key);
      if (key === "atome card") {
        assert.equal(provider.id, creditAccountId);
        assert.equal(provider.name, "ATOME CARD");
        assert.equal(provider.financialAccount?.name, "My Atome Card");
      } else {
        assert.equal(provider.name, name);
        assert.equal(provider.financialAccount?.name, name);
      }
    }
    assert.equal(await client.payLaterAccount.count(), presets.length);
    assert.equal((await loans.getEnabledCreditAccounts(expenseGroupId)).length, presets.length);
    assert.deepEqual(await loans.getEnabledCreditAccounts(otherGroup.id), []);
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
      data: { userId: "alice", name: "SPayLater", key: "spaylater" },
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
