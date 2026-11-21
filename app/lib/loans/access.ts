import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getManilaToday } from "@/app/lib/expenses/date";
import { MAX_AMOUNT_CENTAVOS, sumCentavos } from "@/app/lib/expenses/money";
import { getPayLaterProviderName, payLaterProviders } from "./credit-products";
import { isLoanId, readAmount, readDate, readInstallments, readSubmissionId, readText, validateInstallmentTotal } from "./form";

const cashFrequencies = ["One-time", "Weekly", "Monthly", "Other"];
const groupSelect = { id: true, publicId: true, name: true } as const;
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
    creditAccount: { select: { name: true, providerKey: true, providerName: true, financialAccount: { select: { name: true } } } },
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

export function createLoanAccess(db: PrismaClient, requireUserId: () => Promise<string>, now: () => Date = () => new Date()) {
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

    async getExpenseGroupPayLater(expenseGroupId: number) {
      const userId = await requireUserId();
      if (!isExpenseGroupId(expenseGroupId)) return { providers: [], accounts: [] };
      const group = await db.expenseGroup.findUnique({
        where: { id: expenseGroupId, userId },
        select: {
          payLaterProviders: { select: { providerKey: true, providerName: true, active: true } },
          user: { select: { payLaterAccounts: {
            where: { financialAccount: { active: true, type: "PAY_LATER" } },
            select: { id: true, providerKey: true, providerName: true, financialAccount: { select: { name: true } } },
            orderBy: [{ financialAccount: { name: "asc" } }, { id: "asc" }],
          } } },
        },
      });
      if (!group?.user) return { providers: [], accounts: [] };

      const providers = new Map<string, { key: string; name: string; active: boolean }>(
        payLaterProviders.map((provider) => [provider.key, { ...provider, active: false }]),
      );
      for (const { providerKey, providerName, active } of group.payLaterProviders) {
        providers.set(providerKey, { key: providerKey, name: getPayLaterProviderName(providerKey, providerName), active });
      }
      const accounts = group.user.payLaterAccounts.flatMap(({ id, providerKey, providerName, financialAccount }) => {
        if (!providers.has(providerKey)) {
          providers.set(providerKey, { key: providerKey, name: getPayLaterProviderName(providerKey, providerName), active: false });
        }
        return financialAccount ? [{ id, providerKey, name: financialAccount.name }] : [];
      });
      return { providers: [...providers.values()], accounts };
    },

    async setGroupCreditAccountSettings(formData: FormData) {
      const userId = await requireUserId();
      const [rawGroupId, extraGroupId] = formData.getAll("expenseGroupId");
      const [providerKey, extraKey] = formData.getAll("providerKey");
      const [activeValue, extraActive] = formData.getAll("active");
      const expenseGroupId = Number(rawGroupId);
      const active = activeValue === "on";

      if (typeof rawGroupId !== "string" || !/^[1-9]\d{0,9}$/.test(rawGroupId) ||
        !isExpenseGroupId(expenseGroupId) || extraGroupId !== undefined) {
        throw new TypeError("Choose one of your expense groups.");
      }
      if (typeof providerKey !== "string" || !providerKey || providerKey.length > 127 ||
        extraKey !== undefined || extraActive !== undefined || (activeValue !== undefined && !active)) {
        throw new TypeError("Choose a valid credit provider and setting.");
      }

      return db.$transaction(async (tx) => {
        const [group] = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM "Spending" WHERE id = ${expenseGroupId} AND "userId" = ${userId} FOR SHARE
        `;
        if (!group) throw new TypeError("Choose one of your expense groups.");

        const key = { expenseGroupId, providerKey };
        const where = { expenseGroupId_providerKey: key };
        let providerName: string | null = null;
        if (!payLaterProviders.some((provider) => provider.key === providerKey)) {
          const provider = await tx.expenseGroupPayLaterProvider.findUnique({ where, select: { providerName: true } })
            ?? await tx.payLaterAccount.findFirst({ where: { userId, providerKey }, select: { providerName: true } });
          if (!provider) throw new TypeError("This credit provider is unavailable.");
          providerName = provider.providerName;
        }
        return tx.expenseGroupPayLaterProvider.upsert({
          where,
          create: { ...key, userId, providerName, active },
          update: { active },
        });
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
      const paymentDay = payment.paidOn.toISOString().slice(0, 10);
      const payloadHash = hashPayload({ ...payment, allocations });

      return db.$transaction(async (tx) => {
        await lockLoanWrites(tx, userId);
        const previous = await tx.loanPayment.findUnique({ where: { userId_submissionId: { userId, submissionId } } });
        if (previous) return previousSubmission(previous, payloadHash);
        if (paymentDay > getManilaToday(now())) throw new TypeError("Payment date cannot be in the future.");

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
          if (paymentDay < startDate.toISOString().slice(0, 10)) {
            throw new TypeError("Payment cannot precede the loan or purchase date.");
          }
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
