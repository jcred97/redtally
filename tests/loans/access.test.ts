import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createExpenseGroupAccess } from "../../app/(dashboard)/_lib/expense-groups/access";
import { createExpenseAccess } from "../../app/(dashboard)/_lib/expenses/access";
import { createLoanAccess } from "../../app/lib/loans/access";
import { createTestDatabase } from "../helpers/database";

function form(entries: ReadonlyArray<readonly [string, string]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

function paymentDraft(allocations: { installmentId: string; amount: string }[]) {
  return form([
    ["submissionId", randomUUID()], ["paidOn", "2026-12-15"], ["fundingAccount", "Checking"],
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

    await expenses.create(
      travel.id, travel.categories[0].id, purchase, randomUUID(), financing("creditAccountName", "Example Pay Later"),
    );
    const [customAccount] = await loans.getEnabledCreditAccounts(travel.id);
    assert.equal(customAccount.name, "Example Pay Later");
    assert.deepEqual(await loans.getEnabledCreditAccounts(household.id), []);
    assert.deepEqual(
      (await loans.getCreditAccountSettings(travel.id)).find((account) => account.id === customAccount.id)?.assignment,
      { active: true, supportsPayLater: true },
    );
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
    const loans = createLoanAccess(client, async () => "alice");
    const otherLoans = createLoanAccess(client, async () => "bob");
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
          title, amountCentavos, date: new Date("2026-11-20"), paymentMethod: "PAY_LATER",
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
    assert.equal(await client.repaymentPlan.count(), 2);
    assert.equal(await client.expense.count(), 2);

    const cashPayment = paymentDraft([{ installmentId: cashInstallment, amount: "500" }]);
    assert.ok((await loans.recordLoanPayment(cashPayment)).id);
    assert.equal((await loans.getCashLoan(loanId))?.installments[0].allocations[0].amountCentavos, 50000);

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
