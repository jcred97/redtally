BEGIN;

ALTER TABLE "ExpenseGroupBank" RENAME TO "BankAssignment";
ALTER TABLE "BankAssignment" RENAME CONSTRAINT "ExpenseGroupBank_pkey" TO "BankAssignment_pkey";
ALTER TABLE "BankAssignment" RENAME CONSTRAINT "ExpenseGroupBank_expenseGroupId_fkey" TO "BankAssignment_expenseGroupId_fkey";
ALTER TABLE "BankAssignment" RENAME CONSTRAINT "ExpenseGroupBank_bankId_fkey" TO "BankAssignment_bankId_fkey";

ALTER INDEX "ExpenseGroupBank_bankId_idx" RENAME TO "BankAssignment_bankId_idx";
ALTER INDEX "ExpenseGroupBank_expenseGroupId_bankId_key" RENAME TO "BankAssignment_expenseGroupId_bankId_key";
ALTER INDEX "ExpenseGroupBank_id_expenseGroupId_key" RENAME TO "BankAssignment_id_expenseGroupId_key";
ALTER SEQUENCE "ExpenseGroupBank_id_seq" RENAME TO "BankAssignment_id_seq";

COMMIT;
