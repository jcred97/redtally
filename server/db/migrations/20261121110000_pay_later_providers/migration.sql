BEGIN;

ALTER TABLE "PayLaterAccount"
    ADD COLUMN "providerKey" VARCHAR(127),
    ADD COLUMN "providerName" VARCHAR(120);

WITH providers AS (
    SELECT id, CASE
        WHEN key IN ('shopee', 'spaylater', 'spay later', 'shopee spaylater') THEN 'shopee'
        WHEN key IN ('lazada', 'lazpaylater', 'laz pay later', 'lazada lazpaylater') THEN 'lazada'
        WHEN key IN ('gcash', 'ggives', 'gcash ggives') THEN 'gcash'
        WHEN key IN ('atome', 'atome card') THEN 'atome'
        WHEN key IN ('billease', 'bill ease') THEN 'billease'
        WHEN key IN ('home-credit', 'home credit', 'home credit installment shopping') THEN 'home-credit'
        ELSE 'custom:' || key
    END AS key
    FROM "PayLaterAccount"
)
UPDATE "PayLaterAccount" account
SET "providerKey" = providers.key,
    "providerName" = CASE WHEN providers.key LIKE 'custom:%' THEN account.name END
FROM providers
WHERE providers.id = account.id;

ALTER TABLE "PayLaterAccount" ALTER COLUMN "providerKey" SET NOT NULL;
CREATE INDEX "PayLaterAccount_userId_providerKey_idx" ON "PayLaterAccount"("userId", "providerKey");

CREATE TABLE "ExpenseGroupPayLaterProvider" (
    "expenseGroupId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "providerKey" VARCHAR(127) NOT NULL,
    "providerName" VARCHAR(120),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseGroupPayLaterProvider_pkey" PRIMARY KEY ("expenseGroupId", "providerKey"),
    CONSTRAINT "ExpenseGroupPayLaterProvider_expenseGroupId_userId_fkey"
        FOREIGN KEY ("expenseGroupId", "userId") REFERENCES "Spending"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "ExpenseGroupPayLaterProvider" ENABLE ROW LEVEL SECURITY;

-- When multiple accounts map to one provider, retain availability if any was eligible.
INSERT INTO "ExpenseGroupPayLaterProvider" ("expenseGroupId", "userId", "providerKey", "providerName", active)
SELECT spending.id, spending."userId", account."providerKey", MIN(account."providerName"),
    BOOL_OR(COALESCE(assignment.active AND assignment."supportsPayLater", account.enabled))
FROM "Spending" spending
JOIN "PayLaterAccount" account ON account."userId" = spending."userId"
LEFT JOIN "CreditAccountAssignment" assignment
    ON assignment."expenseGroupId" = spending.id
    AND assignment."creditAccountId" = account.id
    AND assignment."userId" = spending."userId"
WHERE assignment."creditAccountId" IS NOT NULL OR account.enabled
GROUP BY spending.id, spending."userId", account."providerKey";

COMMIT;
