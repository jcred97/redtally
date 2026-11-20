import { PaymentMethod, type Prisma } from "@/generated/prisma/client";
import { isLoanId, readInstallments, readText, validateInstallmentTotal, type InstallmentInput } from "./form";

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

export async function saveCreditAccount(tx: Prisma.TransactionClient, userId: string, name: string) {
  const key = name.replace(/\s+/g, " ").toLowerCase();
  if (key.length > 120) throw new TypeError("Enter a shorter credit account name.");
  // Keep the account reusable across simultaneous Add Credit Account requests.
  await tx.payLaterAccount.createMany({ data: { userId, name, key }, skipDuplicates: true });
  return tx.payLaterAccount.findUniqueOrThrow({
    where: { userId_key: { userId, key } },
    select: { id: true, name: true },
  });
}

export async function createFinancedPurchase(
  tx: Prisma.TransactionClient,
  userId: string,
  expenseId: number,
  financing: FinancingInput,
) {
  const expense = await tx.expense.findFirst({
    where: { id: expenseId, paymentMethod: PaymentMethod.PAY_LATER, category: { expenseGroup: { userId } } },
    select: { amountCentavos: true },
  });
  if (!expense) throw new TypeError("This expense is unavailable for financing.");
  validateInstallmentTotal(financing.installments, expense.amountCentavos);

  const creditAccountId = "creditAccountId" in financing
    ? financing.creditAccountId
    : (await saveCreditAccount(tx, userId, financing.creditAccountName)).id;
  // Keep availability stable until the expense and its repayment plan commit together.
  const [account] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PayLaterAccount"
    WHERE id = ${creditAccountId}::uuid AND "userId" = ${userId} AND enabled
    FOR SHARE
  `;
  if (!account) throw new TypeError("This credit account is unavailable for new purchases. Review Credit Accounts in Expense Groups.");

  return tx.repaymentPlan.create({
    data: { expenseId, creditAccountId: account.id, installments: { create: financing.installments } },
    select: { id: true },
  });
}
