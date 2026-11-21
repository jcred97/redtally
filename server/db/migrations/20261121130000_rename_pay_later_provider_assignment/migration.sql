BEGIN;

ALTER TABLE "ExpenseGroupPayLaterProvider" RENAME TO "PayLaterProviderAssignment";
ALTER TABLE "PayLaterProviderAssignment"
    RENAME CONSTRAINT "ExpenseGroupPayLaterProvider_pkey" TO "PayLaterProviderAssignment_pkey";
ALTER TABLE "PayLaterProviderAssignment"
    RENAME CONSTRAINT "ExpenseGroupPayLaterProvider_expenseGroupId_userId_fkey"
    TO "PayLaterProviderAssignment_expenseGroupId_userId_fkey";

COMMIT;
