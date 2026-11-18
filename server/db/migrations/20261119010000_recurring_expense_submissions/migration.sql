BEGIN;

CREATE TABLE "RecurringExpenseSubmission" (
    "expenseGroupId" INTEGER NOT NULL,
    "id" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "recurringExpenseId" INTEGER,

    CONSTRAINT "RecurringExpenseSubmission_pkey" PRIMARY KEY ("expenseGroupId", "id"),
    CONSTRAINT "RecurringExpenseSubmission_expenseGroupId_fkey" FOREIGN KEY ("expenseGroupId") REFERENCES "Spending"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpenseSubmission_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RecurringExpenseSubmission_recurringExpenseId_key" ON "RecurringExpenseSubmission"("recurringExpenseId");
ALTER TABLE "RecurringExpenseSubmission" ENABLE ROW LEVEL SECURITY;

COMMIT;
