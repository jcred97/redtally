BEGIN;

CREATE TYPE "FinancialAccountType" AS ENUM ('CASH', 'SAVINGS', 'CHECKING', 'WALLET', 'CREDIT_CARD', 'PAY_LATER', 'OTHER');

CREATE TABLE "FinancialAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PHP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "bankId" INTEGER,
    "payLaterAccountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinancialAccount_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "FinancialAccount_pay_later_profile" CHECK (("type" = 'PAY_LATER') = ("payLaterAccountId" IS NOT NULL)),
    CONSTRAINT "FinancialAccount_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialAccount_bankId_fkey"
        FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialAccount_payLaterAccountId_userId_fkey"
        FOREIGN KEY ("payLaterAccountId", "userId") REFERENCES "PayLaterAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinancialAccount_payLaterAccountId_userId_key" ON "FinancialAccount"("payLaterAccountId", "userId");
CREATE INDEX "FinancialAccount_userId_name_idx" ON "FinancialAccount"("userId", "name");
CREATE INDEX "FinancialAccount_bankId_idx" ON "FinancialAccount"("bankId");

ALTER TABLE "FinancialAccount" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.create_pay_later_financial_account() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    INSERT INTO public."FinancialAccount" ("userId", "name", "type", "payLaterAccountId", "createdAt", "updatedAt")
    VALUES (NEW."userId", NEW."name", 'PAY_LATER', NEW."id", NEW."createdAt", NEW."createdAt");
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_pay_later_financial_account() FROM PUBLIC;

-- Install before the backfill so the trigger's table lock keeps concurrent insertions covered.
CREATE TRIGGER "PayLaterAccount_create_financial_account"
    AFTER INSERT ON "PayLaterAccount"
    FOR EACH ROW EXECUTE FUNCTION public.create_pay_later_financial_account();

INSERT INTO "FinancialAccount" ("userId", "name", "type", "payLaterAccountId", "createdAt", "updatedAt")
SELECT "userId", "name", 'PAY_LATER', "id", "createdAt", "createdAt" FROM "PayLaterAccount";

COMMIT;
