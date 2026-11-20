BEGIN;

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'PAY_LATER';

-- CreateTable
CREATE TABLE "Loan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "expenseGroupId" INTEGER,
    "title" VARCHAR(120) NOT NULL,
    "lender" VARCHAR(120) NOT NULL,
    "amountCentavos" INTEGER NOT NULL,
    "disbursementDate" DATE NOT NULL,
    "receivingAccount" VARCHAR(120) NOT NULL,
    "repaymentFrequency" VARCHAR(16),
    "submissionId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Loan_amount_positive" CHECK ("amountCentavos" > 0)
);

-- CreateTable
CREATE TABLE "PayLaterAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayLaterAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepaymentPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expenseId" INTEGER NOT NULL,
    "creditAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loanId" UUID,
    "planId" UUID,
    "dueDate" DATE NOT NULL,
    "amountCentavos" INTEGER NOT NULL,

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoanInstallment_one_obligation" CHECK (("loanId" IS NULL) <> ("planId" IS NULL)),
    CONSTRAINT "LoanInstallment_amount_positive" CHECK ("amountCentavos" > 0)
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "fundingAccount" VARCHAR(120) NOT NULL,
    "amountCentavos" INTEGER NOT NULL,
    "submissionId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LoanPayment_amount_positive" CHECK ("amountCentavos" > 0)
);

-- CreateTable
CREATE TABLE "LoanPaymentAllocation" (
    "paymentId" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "amountCentavos" INTEGER NOT NULL,

    CONSTRAINT "LoanPaymentAllocation_pkey" PRIMARY KEY ("paymentId","installmentId"),
    CONSTRAINT "LoanPaymentAllocation_amount_positive" CHECK ("amountCentavos" > 0)
);

-- CreateIndex
CREATE INDEX "Loan_expenseGroupId_userId_idx" ON "Loan"("expenseGroupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_userId_submissionId_key" ON "Loan"("userId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "PayLaterAccount_userId_key_key" ON "PayLaterAccount"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RepaymentPlan_expenseId_key" ON "RepaymentPlan"("expenseId");

-- CreateIndex
CREATE INDEX "RepaymentPlan_creditAccountId_idx" ON "RepaymentPlan"("creditAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_loanId_dueDate_key" ON "LoanInstallment"("loanId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_planId_dueDate_key" ON "LoanInstallment"("planId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LoanPayment_userId_submissionId_key" ON "LoanPayment"("userId", "submissionId");

-- CreateIndex
CREATE INDEX "LoanPaymentAllocation_installmentId_idx" ON "LoanPaymentAllocation"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Spending_id_userId_key" ON "Spending"("id", "userId");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_expenseGroupId_userId_fkey" FOREIGN KEY ("expenseGroupId", "userId") REFERENCES "Spending"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLaterAccount" ADD CONSTRAINT "PayLaterAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentPlan" ADD CONSTRAINT "RepaymentPlan_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepaymentPlan" ADD CONSTRAINT "RepaymentPlan_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "PayLaterAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RepaymentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPaymentAllocation" ADD CONSTRAINT "LoanPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "LoanPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPaymentAllocation" ADD CONSTRAINT "LoanPaymentAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "LoanInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayLaterAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepaymentPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanInstallment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanPaymentAllocation" ENABLE ROW LEVEL SECURITY;

COMMIT;
