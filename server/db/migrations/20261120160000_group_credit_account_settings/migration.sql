BEGIN;

CREATE UNIQUE INDEX "PayLaterAccount_id_userId_key" ON "PayLaterAccount"("id", "userId");

-- Accounts without an assignment keep their existing default availability.
CREATE TABLE "CreditAccountAssignment" (
    "expenseGroupId" INTEGER NOT NULL,
    "creditAccountId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supportsPayLater" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CreditAccountAssignment_pkey" PRIMARY KEY ("expenseGroupId", "creditAccountId"),
    CONSTRAINT "CreditAccountAssignment_supported_method_check" CHECK (NOT "active" OR "supportsPayLater"),
    CONSTRAINT "CreditAccountAssignment_expenseGroupId_userId_fkey"
        FOREIGN KEY ("expenseGroupId", "userId") REFERENCES "Spending"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditAccountAssignment_creditAccountId_userId_fkey"
        FOREIGN KEY ("creditAccountId", "userId") REFERENCES "PayLaterAccount"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreditAccountAssignment_creditAccountId_userId_idx" ON "CreditAccountAssignment"("creditAccountId", "userId");

ALTER TABLE "CreditAccountAssignment" ENABLE ROW LEVEL SECURITY;

COMMIT;
