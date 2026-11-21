import { createHash } from "node:crypto";
import { PaymentMethod, Prisma, type BankAssignment, type PrismaClient } from "@/generated/prisma/client";
import { parsePesoAmount } from "@/app/lib/expenses/money";
import { parseExpenseDate, parseExpenseTime } from "@/app/lib/expenses/date";
import { bankPaymentMethodFields, isBankPaymentMethod, type BankPaymentMethod } from "@/app/lib/expenses/payment";
import { parseMerchant } from "@/app/lib/expenses/merchant";
import { requireEnabledPayLaterProvider } from "@/app/lib/pay-later/access";

const MAX_RECORD_ID = 2_147_483_647;
const SUBMISSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExpenseInput = {
  title: unknown;
  merchant?: unknown;
  amount: unknown;
  date: unknown;
  time?: unknown;
  paymentMethod?: unknown;
  bankAssignmentId?: unknown;
  payLaterProviderKey?: unknown;
};

type PaymentSelection = {
  paymentMethod: PaymentMethod | null;
  bankAssignmentId: number | null;
};

type BankPaymentSettings = Pick<BankAssignment, (typeof bankPaymentMethodFields)[BankPaymentMethod]>;

export class BankSelectionError extends TypeError {}

function parsePayLaterProviderKey(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 127) {
    throw new TypeError("Choose a valid credit provider.");
  }
  return value;
}

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_RECORD_ID;
}

export function parseExpenseInput(input: ExpenseInput) {
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new TypeError("Title is required");
  }

  const title = input.title.trim();

  if (title.length > 100) {
    throw new TypeError("Title must be 100 characters or fewer");
  }

  if (typeof input.amount !== "string") {
    throw new TypeError("Enter an amount as a decimal string.");
  }

  let amountCentavos: number;

  try {
    amountCentavos = parsePesoAmount(input.amount);
  } catch (error) {
    if (error instanceof Error) {
      throw new TypeError(error.message);
    }

    throw error;
  }

  return { title, amountCentavos, date: parseExpenseDate(input.date) };
}

export function parsePaymentSelection(input: ExpenseInput): PaymentSelection | undefined {
  const { paymentMethod: method, bankAssignmentId: bank } = input;
  if (method == null && bank == null) return undefined;

  let paymentMethod: PaymentMethod | null = null;
  if (method != null && method !== "") {
    if (typeof method !== "string" || !Object.hasOwn(PaymentMethod, method)) {
      throw new TypeError("Choose a valid payment method.");
    }
    paymentMethod = PaymentMethod[method as keyof typeof PaymentMethod];
  }

  if (bank == null || bank === "") return { paymentMethod, bankAssignmentId: null };

  const bankAssignmentId = typeof bank === "string" && /^[1-9]\d{0,9}$/.test(bank)
    ? Number(bank)
    : NaN;
  if (!validId(bankAssignmentId)) {
    throw new TypeError("Choose a valid bank.");
  }

  return { paymentMethod, bankAssignmentId };
}

export async function validateBankSelection(
  tx: Prisma.TransactionClient,
  expenseGroupId: number,
  { paymentMethod, bankAssignmentId }: PaymentSelection
) {
  if (bankAssignmentId === null) return;
  if (!isBankPaymentMethod(paymentMethod)) {
    throw new BankSelectionError("Choose a card, transfer, or bank payment method to select a bank.");
  }

  // Keep the checked assignment and catalog entry stable until the expense write commits.
  const [assignment] = await tx.$queryRaw<BankPaymentSettings[]>`
    SELECT assignment."supportedDebitCard", assignment."supportedCreditCard",
      assignment."supportedBankTransfer", assignment."supportedBankPayment"
    FROM "ExpenseGroupBank" AS assignment
    JOIN "Bank" AS bank ON bank."id" = assignment."bankId"
    WHERE assignment."id" = ${bankAssignmentId} AND assignment."expenseGroupId" = ${expenseGroupId}
      AND assignment."active" AND bank."active"
    FOR SHARE OF assignment, bank
  `;
  if (!assignment?.[bankPaymentMethodFields[paymentMethod]]) {
    throw new BankSelectionError("This bank is unavailable for the selected payment method in this expense group.");
  }
}

export function createExpenseAccess(
  db: PrismaClient,
  requireUserId: () => Promise<string>
) {
  return {
    async delete(expenseGroupId: number, expenseId: number) {
      const userId = await requireUserId();

      if (!validId(expenseGroupId) || !validId(expenseId)) {
        throw new TypeError("Expense not found in this expense group");
      }

      // Ownership and deletion happen in one query, never a separate pre-check.
      const result = await db.expense.deleteMany({
        where: {
          id: expenseId,
          expenseGroupId,
          category: { expenseGroup: { userId } },
        },
      });

      if (result.count === 0) {
        throw new TypeError("Expense not found in this expense group");
      }
    },

    async create(
      expenseGroupId: number,
      categoryId: number,
      input: ExpenseInput,
      submissionId: unknown,
    ) {
      const userId = await requireUserId();

      if (!validId(expenseGroupId) || !validId(categoryId)) {
        throw new TypeError("Category not found in this expense group");
      }

      if (
        typeof submissionId !== "string" ||
        submissionId.length !== 36 ||
        !SUBMISSION_ID_PATTERN.test(submissionId)
      ) {
        throw new TypeError("Unable to identify this draft. Refresh the page and try again.");
      }

      const values = parseExpenseInput(input);
      const merchant = parseMerchant(input.merchant);
      const timeMinutes = parseExpenseTime(input.time);
      const payment = parsePaymentSelection(input);
      const payLaterProviderKey = payment?.paymentMethod === PaymentMethod.PAY_LATER
        ? parsePayLaterProviderKey(input.payLaterProviderKey)
        : null;
      if (payment?.paymentMethod === PaymentMethod.PAY_LATER && !payLaterProviderKey) {
        throw new TypeError("Choose a credit provider.");
      }
      const submissionKey = { expenseGroupId, id: submissionId.toLowerCase() };
      const payload = [categoryId, values.title, values.amountCentavos, values.date];
      // Keep hashes for saved drafts that predate payment selection valid.
      const paymentPayload = payment && (payment.paymentMethod !== null || payment.bankAssignmentId !== null)
        ? [payment.paymentMethod, payment.bankAssignmentId]
        : [];
      const payloadHash = createHash("sha256")
        // Omitted optional fields preserve hashes for previously saved drafts.
        .update(JSON.stringify([
          ...payload,
          ...paymentPayload,
          ...(timeMinutes === null ? [] : [{ timeMinutes }]),
          ...(merchant ? [{ merchant }] : []),
          // The original field name is part of the persisted hash format.
          ...(payLaterProviderKey ? [{ creditProviderKey: payLaterProviderKey }] : []),
        ]))
        .digest("hex");

      try {
        return await db.$transaction(async (tx) => {
          const [group] = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM "Spending" WHERE id = ${expenseGroupId} AND "userId" = ${userId} FOR SHARE
          `;
          if (!group) throw new TypeError("Category not found in this expense group");

          // A competing retry waits for the first transaction. A failed write releases the claim.
          const claim = await tx.expenseSubmission.createMany({
            data: { ...submissionKey, payloadHash },
            skipDuplicates: true,
          });
          if (claim.count === 0) {
            const submission = await tx.expenseSubmission.findUniqueOrThrow({
              where: { expenseGroupId_id: submissionKey },
              include: { expense: true },
            });
            if (submission.payloadHash !== payloadHash) {
              throw new TypeError(
                "This draft was already saved with different details. Close it and review the saved expense.",
              );
            }
            if (!submission.expense) {
              throw new TypeError("This expense was already saved and has since been deleted.");
            }
            return submission.expense;
          }

          if (payment) await validateBankSelection(tx, expenseGroupId, payment);
          const provider = payLaterProviderKey
            ? await requireEnabledPayLaterProvider(tx, userId, expenseGroupId, payLaterProviderKey)
            : null;

          return tx.expense.create({
            data: {
              ...values,
              merchant,
              timeMinutes,
              paymentMethod: payment?.paymentMethod,
              payLaterProviderKey: provider?.providerKey,
              payLaterProviderName: provider?.providerName,
              ...(payment?.bankAssignmentId == null ? {} : {
                bankAssignment: {
                  connect: { id_expenseGroupId: { id: payment.bankAssignmentId, expenseGroupId } },
                },
              }),
              category: {
                connect: {
                  id_expenseGroupId: { id: categoryId, expenseGroupId },
                  expenseGroup: { userId },
                },
              },
              submission: { connect: { expenseGroupId_id: submissionKey } },
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
          throw new TypeError("Category not found in this expense group");
        }
        throw error;
      }
    },

    async update(
      expenseGroupId: number,
      expenseId: number,
      categoryId: number,
      input: ExpenseInput,
      expectedUpdatedAt: unknown
    ) {
      const userId = await requireUserId();

      if (!validId(expenseGroupId) || !validId(expenseId) || !validId(categoryId)) {
        throw new TypeError("Expense or category not found in this expense group");
      }

      const values = parseExpenseInput(input);
      const merchant = parseMerchant(input.merchant);
      const timeMinutes = input.time === undefined ? undefined : parseExpenseTime(input.time);
      const payment = parsePaymentSelection(input);
      const updatedAt = new Date(
        typeof expectedUpdatedAt === "string" ? expectedUpdatedAt : NaN
      );
      // Advance the version even when two edits arrive in the same millisecond.
      const nextUpdatedAt = new Date(Math.max(Date.now(), updatedAt.getTime() + 1));
      if (
        Number.isNaN(nextUpdatedAt.getTime()) ||
        updatedAt.toISOString() !== expectedUpdatedAt
      ) {
        throw new TypeError("Unable to identify this edit. Refresh the page and try again.");
      }

      const ownedExpense = {
        id: expenseId,
        expenseGroupId,
        category: { expenseGroup: { userId } },
      };

      try {
        const expense = await db.$transaction(async (tx) => {
          const where = { ...ownedExpense, updatedAt };
          const existing = await tx.expense.findUnique({
            where,
            select: {
              paymentMethod: true,
              bankAssignmentId: true,
              payLaterProviderKey: true,
            },
          });
          if (!existing) return undefined;

          const changesPayment = payment && (
            payment.paymentMethod !== existing.paymentMethod ||
            payment.bankAssignmentId !== existing.bankAssignmentId
          );
          let paymentChanges: (PaymentSelection & { legacyBankName: null }) | undefined;
          if (changesPayment) {
            await validateBankSelection(tx, expenseGroupId, payment);
            paymentChanges = { ...payment, legacyBankName: null };
          }

          const method = payment ? payment.paymentMethod : existing.paymentMethod;
          let providerChanges: { payLaterProviderKey: string | null; payLaterProviderName: string | null } | undefined;
          if (method === PaymentMethod.PAY_LATER) {
            const providerKey = input.payLaterProviderKey === undefined
              ? existing.payLaterProviderKey
              : parsePayLaterProviderKey(input.payLaterProviderKey);
            if (!providerKey && (existing.paymentMethod !== method || existing.payLaterProviderKey !== null)) {
              throw new TypeError("Choose a credit provider.");
            }
            if (providerKey && providerKey !== existing.payLaterProviderKey) {
              const provider = await requireEnabledPayLaterProvider(tx, userId, expenseGroupId, providerKey);
              providerChanges = { payLaterProviderKey: provider.providerKey, payLaterProviderName: provider.providerName };
            }
          } else if (existing.paymentMethod === PaymentMethod.PAY_LATER) {
            providerChanges = { payLaterProviderKey: null, payLaterProviderName: null };
          }

          const [updatedExpense] = await tx.expense.updateManyAndReturn({
            where,
            // The composite foreign key keeps the replacement category in this group.
            data: {
              ...values,
              merchant,
              timeMinutes,
              ...paymentChanges,
              ...providerChanges,
              categoryId,
              updatedAt: nextUpdatedAt,
            },
          });
          return updatedExpense;
        });

        if (expense) {
          return expense;
        }
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2003"
        ) {
          throw new TypeError("Expense or category not found in this expense group");
        }

        throw error;
      }

      const existingExpense = await db.expense.findUnique({
        where: ownedExpense,
        select: { id: true },
      });
      if (existingExpense) {
        throw new TypeError(
          "This expense changed since you opened it. Copy any changes you want to keep, then refresh the page."
        );
      }

      throw new TypeError("Expense or category not found in this expense group");
    },
  };
}
