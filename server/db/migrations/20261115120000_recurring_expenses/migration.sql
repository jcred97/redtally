BEGIN;

CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE "RecurringExpenseStatus" AS ENUM ('ACTIVE', 'PAUSED', 'NEEDS_ATTENTION');

CREATE TABLE "RecurringExpense" (
    "id" SERIAL NOT NULL,
    "expenseGroupId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "bankAssignmentId" INTEGER,
    "title" TEXT NOT NULL,
    "amountCentavos" INTEGER NOT NULL,
    "paymentMethod" "TransactionType",
    "frequency" "RecurrenceFrequency" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextDueDate" DATE NOT NULL,
    "status" "RecurringExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecurringExpense_amountCentavos_check" CHECK ("amountCentavos" > 0),
    CONSTRAINT "RecurringExpense_endDate_check" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "RecurringExpense_nextDueDate_check" CHECK ("nextDueDate" >= "startDate"),
    CONSTRAINT "RecurringExpense_expenseGroupId_fkey" FOREIGN KEY ("expenseGroupId") REFERENCES "Spending"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_categoryId_expenseGroupId_fkey" FOREIGN KEY ("categoryId", "expenseGroupId") REFERENCES "Category"("id", "spendingId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_bankAssignmentId_expenseGroupId_fkey" FOREIGN KEY ("bankAssignmentId", "expenseGroupId") REFERENCES "ExpenseGroupBank"("id", "expenseGroupId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RecurringExpense_expenseGroupId_idx" ON "RecurringExpense"("expenseGroupId");
CREATE INDEX "RecurringExpense_categoryId_expenseGroupId_idx" ON "RecurringExpense"("categoryId", "expenseGroupId");
CREATE INDEX "RecurringExpense_bankAssignmentId_expenseGroupId_idx" ON "RecurringExpense"("bankAssignmentId", "expenseGroupId");
CREATE INDEX "RecurringExpense_status_nextDueDate_id_idx" ON "RecurringExpense"("status", "nextDueDate", "id");

CREATE TABLE "RecurringExpenseOccurrence" (
    "recurringExpenseId" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "expenseId" INTEGER,

    CONSTRAINT "RecurringExpenseOccurrence_pkey" PRIMARY KEY ("recurringExpenseId", "dueDate"),
    CONSTRAINT "RecurringExpenseOccurrence_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpenseOccurrence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RecurringExpenseOccurrence_expenseId_key" ON "RecurringExpenseOccurrence"("expenseId");

ALTER TABLE "RecurringExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringExpenseOccurrence" ENABLE ROW LEVEL SECURITY;

COMMIT;
