import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createExpenseAccess } from "../../app/(dashboard)/_lib/expenses/access";
import { createExpenseGroupAccess } from "../../app/(dashboard)/_lib/expense-groups/access";
import { createLoanAccess } from "../../app/lib/loans/access";
import { createTestDatabase } from "../helpers/database";

function form(entries: ReadonlyArray<readonly [string, string]>) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

test("cash loans remain private and a provider bill applies once across purchase plans", async () => {
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
    const secondGroup = await client.expenseGroup.create({
      data: { name: "Household", userId: "alice", categories: { create: { name: "Appliances" } } },
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
    await assert.rejects(loans.createCashLoan(cashDraft));
    cashDraft.set("expenseGroupId", String(group.id));
    const { id: loanId } = await loans.createCashLoan(cashDraft);
    assert.equal((await loans.createCashLoan(cashDraft)).id, loanId);
    assert.equal(await otherLoans.getCashLoan(loanId), null);
    assert.deepEqual((await loans.getCashLoans()).map(({ id }) => id), [loanId]);
    assert.deepEqual(await otherLoans.getCashLoans(), []);
    assert.deepEqual((await loans.getCashLoansForExpenseGroup(group.id)).map(({ id }) => id), [loanId]);
    assert.equal(await client.loan.count(), 1);

    const account = await client.payLaterAccount.create({ data: { userId: "alice", name: "SPayLater", key: "spaylater" } });
    const enableProduct = form([["productKey", "spaylater"], ["enabled", "on"]]);
    const disableProduct = form([["productKey", "spaylater"]]);
    assert.equal((await loans.setCreditProductEnabled(enableProduct)).id, account.id);
    assert.deepEqual(await loans.getEnabledCreditAccounts(), [{ id: account.id, name: account.name }]);
    const otherAccount = await client.payLaterAccount.create({ data: { userId: "bob", name: "Other", key: "other" } });
    const expenses = createExpenseAccess(client, async () => "alice");
    const createPurchase = (title: string, amount: string, accountId: string, submissionId: string, expenseGroup = group) => expenses.create(
      expenseGroup.id, expenseGroup.categories[0].id,
      { title, amount, date: "2026-11-20", paymentMethod: "PAY_LATER" }, submissionId,
      form([["creditAccountId", accountId], ["installmentDate", "2026-12-15"], ["installmentAmount", amount]]),
    );
    await assert.rejects(createPurchase("Other owner's account", "10", otherAccount.id, randomUUID()));
    assert.equal(await client.expense.count(), 0);

    const sprayerDraft = randomUUID();
    const sprayer = await createPurchase("Paint sprayer", "1200", account.id, sprayerDraft);
    assert.equal((await createPurchase("Paint sprayer", "1200", account.id, sprayerDraft)).id, sprayer.id);
    await createPurchase("Drill set", "450", account.id, randomUUID(), secondGroup);
    const installments = await client.loanInstallment.findMany({ where: { plan: { creditAccountId: account.id } } });
    assert.equal(installments.length, 2);

    await loans.setCreditProductEnabled(disableProduct);
    assert.deepEqual(await loans.getEnabledCreditAccounts(), []);
    assert.equal((await loans.getCreditAccount(account.id))?.plans.length, 2);
    assert.deepEqual(await loans.getCreditAccountSettings(), [
      { id: account.id, name: account.name, key: account.key, enabled: false },
    ]);
    assert.deepEqual(await otherLoans.getCreditAccountSettings(), [
      { id: otherAccount.id, name: otherAccount.name, key: otherAccount.key, enabled: true },
    ]);
    const visibleAccounts = await loans.getCreditAccounts();
    assert.deepEqual(visibleAccounts.map(({ id, enabled }) => ({ id, enabled })), [{ id: account.id, enabled: false }]);
    assert.deepEqual(visibleAccounts[0].plans.flatMap(({ installments }) => installments.map(({ amountCentavos }) => amountCentavos)).sort((a, b) => a - b), [45000, 120000]);
    assert.deepEqual((await otherLoans.getCreditAccounts()).map(({ id }) => id), [otherAccount.id]);
    assert.deepEqual(await otherLoans.getEnabledCreditAccounts(), [{ id: otherAccount.id, name: otherAccount.name }]);
    await assert.rejects(createPurchase("Disabled account", "10", account.id, randomUUID()), /credit account/i);
    await assert.rejects(expenses.create(
      group.id, group.categories[0].id,
      { title: "Disabled account by name", amount: "10", date: "2026-11-20", paymentMethod: "PAY_LATER" }, randomUUID(),
      form([["creditAccountName", "spaylater"], ["installmentDate", "2026-12-15"], ["installmentAmount", "10"]]),
    ), /credit account/i);
    assert.equal((await createPurchase("Paint sprayer", "1200", account.id, sprayerDraft)).id, sprayer.id);
    assert.equal(await client.expense.count(), 2);

    const paymentDraft = form([
      ["submissionId", randomUUID()], ["paidOn", "2026-12-15"], ["fundingAccount", "Checking"], ["amount", "1650"],
      ...installments.flatMap(({ id, amountCentavos }): [string, string][] => [
        ["installmentId", id], ["allocationAmount", (amountCentavos / 100).toFixed(2)],
      ]),
    ]);
    await assert.rejects(otherLoans.recordLoanPayment(paymentDraft));
    const payment = await loans.recordLoanPayment(paymentDraft);
    assert.equal((await loans.recordLoanPayment(paymentDraft)).id, payment.id);
    paymentDraft.set("submissionId", randomUUID());
    await assert.rejects(loans.recordLoanPayment(paymentDraft));
    assert.equal(await client.loanPayment.count(), 1);
    const allocations = await client.loanPaymentAllocation.findMany({ where: { paymentId: payment.id } });
    assert.equal(allocations.length, 2);
    assert.equal(allocations.reduce((sum, allocation) => sum + allocation.amountCentavos, 0), 165000);
    assert.equal((await loans.setCreditProductEnabled(enableProduct)).id, account.id);
    assert.deepEqual(await loans.getEnabledCreditAccounts(), [{ id: account.id, name: account.name }]);

    const expenseGroups = createExpenseGroupAccess(client, async () => "alice");
    await expenseGroups.duplicate(group.id);
    assert.equal(await client.expense.count(), 3);
    assert.equal(await client.loan.count(), 1);
    assert.equal(await client.repaymentPlan.count(), 2);

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
