BEGIN;

ALTER TABLE "Expense"
    ADD COLUMN "spayLaterDueDay" SMALLINT,
    ADD COLUMN "spayLaterMonths" SMALLINT,
    ADD COLUMN "spayLaterCompletedOn" DATE,
    ADD CONSTRAINT "Expense_spayLater_terms_check" CHECK (
        (
            "spayLaterDueDay" IS NULL
            AND "spayLaterMonths" IS NULL
            AND "spayLaterCompletedOn" IS NULL
        )
        OR (
            "spayLaterDueDay" IS NOT NULL
            AND "spayLaterDueDay" IN (5, 15)
            AND "spayLaterMonths" IS NOT NULL
            AND "spayLaterMonths" IN (1, 3, 6, 12)
            AND "transactionType" IS NOT DISTINCT FROM 'PAY_LATER'::"TransactionType"
            AND "payLaterProviderKey" IS NOT DISTINCT FROM 'shopee'
        )
    );

COMMIT;
