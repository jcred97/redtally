BEGIN;

CREATE UNIQUE INDEX "Expense_id_expenseGroupId_key" ON "Expense"("id", "expenseGroupId");

CREATE TABLE "Billing" (
    "id" SERIAL NOT NULL,
    "expenseGroupId" INTEGER NOT NULL,
    "dueDay" SMALLINT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "statementDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Billing_expenseGroupId_fkey" FOREIGN KEY ("expenseGroupId") REFERENCES "Spending"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Billing_cycle_dates_check" CHECK (
        "periodStart" >= DATE '0001-01-01'
        AND "dueDate" <= DATE '9999-12-31'
        AND "statementDate" = ("periodStart" + INTERVAL '1 month')::DATE
        AND "periodEnd" = "statementDate" - 1
        AND (
            ("dueDay" = 5 AND EXTRACT(DAY FROM "periodStart") = 25
                AND "dueDate" = (date_trunc('month', "statementDate"::timestamp) + INTERVAL '1 month 4 days')::DATE)
            OR
            ("dueDay" = 15 AND EXTRACT(DAY FROM "periodStart") = 5
                AND "dueDate" = "statementDate" + 10)
        )
    )
);

CREATE UNIQUE INDEX "Billing_id_expenseGroupId_key" ON "Billing"("id", "expenseGroupId");
CREATE UNIQUE INDEX "Billing_group_dueDay_period_key" ON "Billing"("expenseGroupId", "dueDay", "periodStart", "periodEnd");

CREATE TABLE "BillingInstallment" (
    "id" SERIAL NOT NULL,
    "expenseGroupId" INTEGER NOT NULL,
    "billingId" INTEGER NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "installmentNumber" SMALLINT NOT NULL,
    "amountCentavos" INTEGER NOT NULL,

    CONSTRAINT "BillingInstallment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BillingInstallment_number_check" CHECK ("installmentNumber" BETWEEN 1 AND 12),
    CONSTRAINT "BillingInstallment_amountCentavos_check" CHECK ("amountCentavos" >= 0),
    CONSTRAINT "BillingInstallment_billingId_expenseGroupId_fkey" FOREIGN KEY ("billingId", "expenseGroupId") REFERENCES "Billing"("id", "expenseGroupId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingInstallment_expenseId_expenseGroupId_fkey" FOREIGN KEY ("expenseId", "expenseGroupId") REFERENCES "Expense"("id", "expenseGroupId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BillingInstallment_billingId_expenseId_key" ON "BillingInstallment"("billingId", "expenseId");
CREATE UNIQUE INDEX "BillingInstallment_expenseId_installmentNumber_key" ON "BillingInstallment"("expenseId", "installmentNumber");

ALTER TABLE "Billing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingInstallment" ENABLE ROW LEVEL SECURITY;

COMMIT;
