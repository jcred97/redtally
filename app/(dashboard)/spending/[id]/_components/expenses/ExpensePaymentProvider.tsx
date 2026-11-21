import type { ExpenseHistoryEntry } from "@/app/(dashboard)/_lib/expense-groups/queries";
import BankLogo from "../banks/BankLogo";

export function getExpenseBankName(expense: ExpenseHistoryEntry) {
  return expense.bankAssignment?.bank.name ?? expense.legacyBankName;
}

export function getExpensePaymentProvider(expense: ExpenseHistoryEntry) {
  const creditProvider = expense.payLaterProviderName?.trim();
  if (creditProvider) return { name: creditProvider, isBank: false };

  const bank = getExpenseBankName(expense)?.trim();
  return bank ? { name: bank, isBank: true } : null;
}

export default function ExpensePaymentProvider({ name, isBank }: NonNullable<ReturnType<typeof getExpensePaymentProvider>>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {isBank && <BankLogo name={name} compact />}
      <span className="wrap-anywhere">{name}</span>
    </span>
  );
}
