BEGIN;

CREATE TABLE "ReceiptScanner" (
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keySuffix" TEXT NOT NULL,

    CONSTRAINT "ReceiptScanner_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "ReceiptScanner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "ReceiptScanner" ENABLE ROW LEVEL SECURITY;

COMMIT;
