BEGIN;

-- Keep internal IDs and relationships while giving each group a random URL identifier.
ALTER TABLE "Spending"
ADD COLUMN "publicId" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "Spending_publicId_key" ON "Spending"("publicId");

COMMIT;
