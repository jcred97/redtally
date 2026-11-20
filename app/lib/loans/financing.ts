import { PaymentMethod, type Prisma } from "@/generated/prisma/client";
import { isLoanId, readInstallments, readText, validateInstallmentTotal, type InstallmentInput } from "./form";

const creditAccountUnavailable = "This credit account is unavailable for new purchases in this expense group. Review the Credit Accounts tab.";

export type FinancingInput = {
  installments: InstallmentInput[];
} & ({ creditAccountId: string } | { creditAccountName: string });

export function readFinancing(formData: FormData, expenseDate: Date): FinancingInput {
  const id = formData.get("creditAccountId");
  const name = formData.get("creditAccountName");
  const installments = readInstallments(formData, expenseDate);
  if (!id) return { creditAccountName: readText(name, "Credit account name"), installments };
  if (!isLoanId(id) || name) throw new TypeError("Choose a valid credit account.");
  return { creditAccountId: id.toLowerCase(), installments };
}

export async function saveCreditAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  name: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const key = name.replace(/\s+/g, " ").toLowerCase();
  if (key.length > 120) throw new TypeError("Enter a shorter credit account name.");
  // Keep the account reusable across simultaneous Add Credit Account requests.
  const { count } = await tx.payLaterAccount.createMany({ data: { userId, name, key, enabled }, skipDuplicates: true });
  const account = await tx.payLaterAccount.findUniqueOrThrow({
    where: { userId_key: { userId, key } },
    select: { id: true, name: true },
  });
  return { ...account, created: count === 1 };
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

  const { id: creditAccountId, created } = "creditAccountId" in financing
    ? { id: financing.creditAccountId, created: false }
    : await saveCreditAccount(tx, userId, financing.creditAccountName, { enabled: false });
  const [account] = await tx.$queryRaw<{ enabled: boolean }[]>`
    SELECT enabled FROM "PayLaterAccount"
    WHERE id = ${creditAccountId}::uuid AND "userId" = ${userId}
    FOR SHARE
  `;
  if (!account) throw new TypeError(creditAccountUnavailable);

  const { expenseGroupId } = expense;
  if (created) {
    await tx.creditAccountAssignment.create({
      data: { expenseGroupId, creditAccountId, userId, active: true, supportsPayLater: true },
    });
  } else {
    // Group settings writers lock the account before changing assignments. Read after acquiring
    // that lock so a purchase that waited for a settings update sees the saved assignment.
    const assignment = await tx.creditAccountAssignment.findUnique({
      where: { expenseGroupId_creditAccountId: { expenseGroupId, creditAccountId }, userId },
      select: { active: true, supportsPayLater: true },
    });
    const enabled = assignment ? assignment.active && assignment.supportsPayLater : account.enabled;
    if (!enabled) throw new TypeError(creditAccountUnavailable);
  }

  return tx.repaymentPlan.create({
    data: { expenseId, creditAccountId, installments: { create: financing.installments } },
    select: { id: true },
  });
}
