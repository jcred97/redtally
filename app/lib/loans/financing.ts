import { PaymentMethod, type Prisma } from "@/generated/prisma/client";
import { isLoanId, readInstallments, validateInstallmentTotal, type InstallmentInput } from "./form";

const creditAccountUnavailable = "This credit account is unavailable for new purchases in this expense group. Review Pay Later in the Payment Provider tab.";

export type FinancingInput = {
  installments: InstallmentInput[];
  creditAccountId: string;
  creditProviderKey: string;
};

export function readFinancing(formData: FormData, expenseDate: Date): FinancingInput {
  const [id, extraId] = formData.getAll("creditAccountId");
  const [provider, extraProvider] = formData.getAll("creditProviderKey");
  if (!isLoanId(id) || typeof provider !== "string" || !provider || provider.length > 127 || extraId || extraProvider) {
    throw new TypeError("Choose a credit provider and an existing Pay Later account.");
  }
  return { creditAccountId: id.toLowerCase(), creditProviderKey: provider, installments: readInstallments(formData, expenseDate) };
}

export async function saveCreditAccount(tx: Prisma.TransactionClient, userId: string, name: string, providerKey: string, providerName?: string) {
  const key = name.replace(/\s+/g, " ").toLowerCase();
  if (key.length > 120) throw new TypeError("Enter a shorter credit account name.");
  // Reuse the same provider across retries and concurrent requests.
  const { count } = await tx.payLaterAccount.createMany({
    data: { userId, name, key, providerKey, providerName, enabled: false },
    skipDuplicates: true,
  });
  const account = await tx.payLaterAccount.findUniqueOrThrow({
    where: { userId_key: { userId, key } },
    select: { id: true, providerKey: true },
  });
  if (account.providerKey !== providerKey) throw new TypeError("An account with this name already uses a different credit provider.");
  return { id: account.id, created: count === 1 };
}

export async function createFinancedPurchase(
  tx: Prisma.TransactionClient,
  userId: string,
  expenseId: number,
  financing: FinancingInput,
) {
  const expense = await tx.expense.findFirst({
    where: { id: expenseId, paymentMethod: PaymentMethod.PAY_LATER, category: { expenseGroup: { userId } } },
    select: { amountCentavos: true, expenseGroupId: true },
  });
  if (!expense) throw new TypeError("This expense is unavailable for financing.");
  validateInstallmentTotal(financing.installments, expense.amountCentavos);

  const { creditAccountId, creditProviderKey } = financing;
  const [account] = await tx.$queryRaw<{ id: string }[]>`
    SELECT credit.id FROM "FinancialAccount" finance
    JOIN "PayLaterAccount" credit ON credit.id = finance."payLaterAccountId" AND credit."userId" = finance."userId"
    WHERE credit.id = ${creditAccountId}::uuid AND credit."userId" = ${userId}
      AND credit."providerKey" = ${creditProviderKey} AND finance.type = 'PAY_LATER' AND finance.active
    FOR SHARE OF finance, credit
  `;
  if (!account) throw new TypeError(creditAccountUnavailable);

  const [provider] = await tx.$queryRaw<{ active: boolean }[]>`
    SELECT active FROM "ExpenseGroupPayLaterProvider"
    WHERE "expenseGroupId" = ${expense.expenseGroupId} AND "userId" = ${userId} AND "providerKey" = ${creditProviderKey}
    FOR SHARE
  `;
  if (!provider?.active) throw new TypeError(creditAccountUnavailable);

  return tx.repaymentPlan.create({
    data: { expenseId, creditAccountId, installments: { create: financing.installments } },
    select: { id: true },
  });
}
