import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { MAX_AMOUNT_CENTAVOS, sumCentavos } from "@/app/lib/expenses/money";
import { creditProducts } from "./credit-products";
import { isLoanId, readAmount, readDate, readInstallments, readSubmissionId, readText, validateInstallmentTotal } from "./form";

const cashFrequencies = ["One-time", "Weekly", "Monthly", "Other"];
const groupSelect = { id: true, publicId: true, name: true } as const;
const creditAccountSelect = { id: true, name: true } as const;
const expenseInclude = { category: { include: { expenseGroup: { select: groupSelect } } } } as const;

function isExpenseGroupId(id: number) {
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647;
}

function ownedPlan(userId: string) {
  return { creditAccount: { userId }, expense: { category: { expenseGroup: { userId } } } };
}

function installmentsFor(userId: string) {
  return {
    orderBy: { dueDate: "asc" },
    include: {
      allocations: {
        where: { payment: { userId } },
        include: { payment: { select: { id: true, paidOn: true, fundingAccount: true, amountCentavos: true } } },
        orderBy: [{ payment: { paidOn: "asc" } }, { paymentId: "asc" }],
      },
    },
  } satisfies Prisma.LoanInstallmentFindManyArgs;
}

function loanInclude(userId: string) {
  return { expenseGroup: { select: groupSelect }, installments: installmentsFor(userId) } as const;
}

function planInclude(userId: string) {
  return {
    creditAccount: { select: { name: true } },
    expense: { include: expenseInclude },
    installments: installmentsFor(userId),
  } as const;
}

function readCashLoan(formData: FormData) {
  const rawGroup = formData.get("expenseGroupId");
  const expenseGroupId = rawGroup === null || rawGroup === "" ? null : Number(rawGroup);
  if (expenseGroupId !== null &&
    (typeof rawGroup !== "string" || !/^[1-9]\d{0,9}$/.test(rawGroup) || !isExpenseGroupId(expenseGroupId))) {
    throw new TypeError("Choose one of your expense groups.");
  }
  const repaymentFrequency = formData.get("repaymentFrequency") || null;
  if (repaymentFrequency !== null &&
    (typeof repaymentFrequency !== "string" || !cashFrequencies.includes(repaymentFrequency))) {
    throw new TypeError("Choose a repayment frequency.");
  }

  const disbursementDate = readDate(formData.get("disbursementDate"), "disbursement date");
  const amountCentavos = readAmount(formData.get("amount"));
  const installments = readInstallments(formData, disbursementDate);
  if (repaymentFrequency === "One-time" && installments.length !== 1) {
    throw new TypeError("Enter one scheduled payment for a one-time loan.");
  }
  validateInstallmentTotal(installments, amountCentavos);
  return {
    title: readText(formData.get("title"), "Loan name"),
    lender: readText(formData.get("lender"), "Lender"),
    receivingAccount: readText(formData.get("receivingAccount"), "Receiving account"),
    disbursementDate, amountCentavos, expenseGroupId, repaymentFrequency, installments,
  };
}

function readPayment(formData: FormData) {
  const ids = formData.getAll("installmentId");
  const amounts = formData.getAll("allocationAmount");
  if (ids.length !== amounts.length || ids.length > 500) {
    throw new TypeError("Choose the installments covered by this payment.");
  }
  const allocations = [];
  for (const [index, id] of ids.entries()) {
    const amount = amounts[index];
    if (typeof amount === "string" && !amount.trim()) continue;
    if (!isLoanId(id)) throw new TypeError("Choose a valid installment.");
    allocations.push({ installmentId: id.toLowerCase(), amountCentavos: readAmount(amount) });
  }
  allocations.sort((left, right) => left.installmentId.localeCompare(right.installmentId));
  if (!allocations.length || new Set(allocations.map(({ installmentId }) => installmentId)).size !== allocations.length) {
    throw new TypeError("Enter an amount for each installment you want to pay.");
  }

  const amountCentavos = sumCentavos(allocations.map((allocation) => allocation.amountCentavos));
  const statedAmount = formData.get("amount");
  if (amountCentavos > MAX_AMOUNT_CENTAVOS) throw new TypeError("The payment total is too large.");
  if (statedAmount && amountCentavos !== readAmount(statedAmount)) {
    throw new TypeError("The installment amounts must add up to the actual payment.");
  }
  return {
    paidOn: readDate(formData.get("paidOn"), "payment date"),
    fundingAccount: readText(formData.get("fundingAccount"), "Funding account"),
    amountCentavos, allocations,
  };
}

async function lockLoanWrites(tx: Prisma.TransactionClient, userId: string) {
  // Serialize each owner's retries and balance checks without blocking foreign-key checks.
  const [owner] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "user" WHERE id = ${userId} FOR NO KEY UPDATE
  `;
  if (!owner) throw new TypeError("Your account is unavailable.");
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function previousSubmission(previous: { id: string; payloadHash: string }, payloadHash: string) {
  if (previous.payloadHash !== payloadHash) {
    throw new TypeError("This draft was already saved with different details. Review the saved record before trying again.");
  }
  return { id: previous.id };
}

export function createLoanAccess(db: PrismaClient, requireUserId: () => Promise<string>) {
  return {
    async getCashLoans() {
      const userId = await requireUserId();
      return db.loan.findMany({
        where: { userId },
        select: { id: true, title: true, lender: true, installments: installmentsFor(userId) },
        orderBy: { createdAt: "desc" },
      });
    },

    async getCashLoansForExpenseGroup(expenseGroupId: number) {
      const userId = await requireUserId();
      if (!isExpenseGroupId(expenseGroupId)) return [];
      return db.loan.findMany({
        where: { userId, expenseGroupId, expenseGroup: { userId } },
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
      });
    },

    async getCashLoan(id: string) {
      const userId = await requireUserId();
      if (!isLoanId(id)) return null;
      return db.loan.findUnique({ where: { id, userId }, include: loanInclude(userId) });
    },

    async getRepaymentPlan(id: string) {
      const userId = await requireUserId();
      if (!isLoanId(id)) return null;
      return db.repaymentPlan.findUnique({ where: { id, ...ownedPlan(userId) }, include: planInclude(userId) });
    },

    async getCreditAccountSettings(expenseGroupId: number) {
      const userId = await requireUserId();
      if (!isExpenseGroupId(expenseGroupId)) return [];

      const accounts = await db.payLaterAccount.findMany({
        where: { userId, user: { expenseGroups: { some: { id: expenseGroupId } } } },
        select: {
          ...creditAccountSelect,
          key: true,
          enabled: true,
          assignments: { where: { expenseGroupId }, select: { active: true, supportsPayLater: true } },
        },
        orderBy: { name: "asc" },
      });
      return accounts.map(({ assignments, ...account }) => ({ ...account, assignment: assignments[0] ?? null }));
    },

    async getEnabledCreditAccounts(expenseGroupId: number) {
      const userId = await requireUserId();
      if (!isExpenseGroupId(expenseGroupId)) return [];

      return db.payLaterAccount.findMany({
        where: {
          userId,
          user: { expenseGroups: { some: { id: expenseGroupId } } },
          OR: [
            { assignments: { some: { expenseGroupId, active: true, supportsPayLater: true } } },
            { enabled: true, assignments: { none: { expenseGroupId } } },
          ],
        },
        select: creditAccountSelect,
        orderBy: { name: "asc" },
      });
    },

    async setGroupCreditAccountSettings(formData: FormData) {
      const userId = await requireUserId();
      const [rawGroupId, extraGroupId] = formData.getAll("expenseGroupId");
      const [productKey, extraKey] = formData.getAll("productKey");
      const [accountId, extraAccountId] = formData.getAll("creditAccountId");
      const [activeValue, extraActive] = formData.getAll("active");
      const [methodValue, extraMethod] = formData.getAll("supportsPayLater");
      const expenseGroupId = Number(rawGroupId);
      const product = creditProducts.find((candidate) => candidate.key === productKey);
      const active = activeValue === "on";
      const supportsPayLater = methodValue === "on";

      if (typeof rawGroupId !== "string" || !/^[1-9]\d{0,9}$/.test(rawGroupId) ||
        !isExpenseGroupId(expenseGroupId) || extraGroupId !== undefined) {
        throw new TypeError("Choose one of your expense groups.");
      }
      if ((productKey === undefined ? !isLoanId(accountId) : !product || accountId !== undefined) ||
        extraKey !== undefined || extraAccountId !== undefined || extraActive !== undefined || extraMethod !== undefined ||
        (activeValue !== undefined && !active) || (methodValue !== undefined && !supportsPayLater)) {
        throw new TypeError("Choose a valid credit account and setting.");
      }
      if (active && !supportsPayLater) throw new TypeError("Choose at least one credit method to enable this credit account.");

      return db.$transaction(async (tx) => {
        const [group] = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM "Spending" WHERE id = ${expenseGroupId} AND "userId" = ${userId} FOR SHARE
        `;
        if (!group) throw new TypeError("Choose one of your expense groups.");

        if (product) {
          // The first group setting must leave other groups at their default availability.
          await tx.payLaterAccount.createMany({
            data: { userId, key: product.key, name: product.name, enabled: false },
            skipDuplicates: true,
          });
        }

        // Use the same account lock as financed purchases before changing eligibility.
        const [account] = product
          ? await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "PayLaterAccount" WHERE "userId" = ${userId} AND key = ${product.key} FOR UPDATE
          `
          : await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "PayLaterAccount" WHERE "userId" = ${userId} AND id = ${accountId}::uuid FOR UPDATE
          `;
        if (!account) throw new TypeError("This credit account is unavailable.");

        const assignment = { expenseGroupId, creditAccountId: account.id };
        await tx.creditAccountAssignment.upsert({
          where: { expenseGroupId_creditAccountId: assignment },
          create: { ...assignment, userId, active },
          update: active ? { active, supportsPayLater } : { active },
        });
        return account;
      });
    },

    async createCashLoan(formData: FormData) {
      const userId = await requireUserId();
      const submissionId = readSubmissionId(formData);
      const { installments, ...loan } = readCashLoan(formData);
      const payloadHash = hashPayload({ ...loan, installments });

      return db.$transaction(async (tx) => {
        await lockLoanWrites(tx, userId);
        const previous = await tx.loan.findUnique({ where: { userId_submissionId: { userId, submissionId } } });
        if (previous) return previousSubmission(previous, payloadHash);

        if (loan.expenseGroupId !== null) {
          const [group] = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM "Spending" WHERE id = ${loan.expenseGroupId} AND "userId" = ${userId} FOR SHARE
          `;
          if (!group) throw new TypeError("Choose one of your expense groups.");
        }
        return tx.loan.create({
          data: { ...loan, userId, submissionId, payloadHash, installments: { create: installments } },
          select: { id: true },
        });
      });
    },

    async recordLoanPayment(formData: FormData) {
      const userId = await requireUserId();
      const submissionId = readSubmissionId(formData);
      const { allocations, ...payment } = readPayment(formData);
      const payloadHash = hashPayload({ ...payment, allocations });

      return db.$transaction(async (tx) => {
        await lockLoanWrites(tx, userId);
        const previous = await tx.loanPayment.findUnique({ where: { userId_submissionId: { userId, submissionId } } });
        if (previous) return previousSubmission(previous, payloadHash);

        const installments = await tx.loanInstallment.findMany({
          where: {
            id: { in: allocations.map(({ installmentId }) => installmentId) },
            OR: [{ loan: { userId } }, { plan: ownedPlan(userId) }],
          },
          include: {
            allocations: { select: { amountCentavos: true } },
            loan: { select: { disbursementDate: true } },
            plan: { select: { expense: { select: { date: true } } } },
          },
        });
        if (installments.length !== allocations.length) throw new TypeError("One or more installments are unavailable.");
        const targets = new Set(installments.map(({ loanId, planId }) =>
          loanId ? `cash:${loanId}` : `plan:${planId}`,
        ));
        if (targets.size !== 1) throw new TypeError("Choose installments from a single loan or repayment plan.");

        const requested = new Map(allocations.map((allocation) => [allocation.installmentId, allocation.amountCentavos]));
        for (const installment of installments) {
          const startDate = installment.loan?.disbursementDate ?? installment.plan!.expense.date;
          if (payment.paidOn < startDate) throw new TypeError("Payment cannot precede the loan or purchase date.");
          const paidCentavos = sumCentavos(installment.allocations.map((allocation) => allocation.amountCentavos));
          if (requested.get(installment.id)! > installment.amountCentavos - paidCentavos) {
            throw new TypeError("A payment amount exceeds the remaining balance on an installment.");
          }
        }
        return tx.loanPayment.create({
          data: { ...payment, userId, submissionId, payloadHash, allocations: { create: allocations } },
          select: { id: true },
        });
      });
    },
  };
}
