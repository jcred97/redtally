BEGIN;

ALTER TABLE "Expense"
    ADD COLUMN "payLaterProviderKey" VARCHAR(127),
    ADD COLUMN "payLaterProviderName" VARCHAR(120);

-- Carry over the provider for purchases with a known account belonging to the expense group's owner.
UPDATE "Expense" expense
SET "payLaterProviderKey" = account."providerKey",
    "payLaterProviderName" = account."providerName"
FROM "RepaymentPlan" plan
JOIN "PayLaterAccount" account ON account.id = plan."creditAccountId"
JOIN "Spending" spending ON spending."userId" = account."userId"
WHERE expense.id = plan."expenseId"
  AND expense."expenseGroupId" = spending.id
  AND expense."transactionType" = 'PAY_LATER';

DROP TABLE "LoanPaymentAllocation", "LoanInstallment", "LoanPayment", "Loan",
    "RepaymentPlan", "CreditAccountAssignment", "FinancialAccount", "PayLaterAccount";
DROP FUNCTION public.create_pay_later_financial_account();
DROP TYPE "FinancialAccountType";

COMMIT;
