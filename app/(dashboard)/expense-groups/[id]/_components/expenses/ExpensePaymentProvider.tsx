import Image from "next/image";
import type { ExpenseHistoryEntry } from "@/app/(dashboard)/_lib/expense-groups/queries";
import BankLogo from "../banks/BankLogo";

type PaymentProvider = { name: string; kind: "bank" | "shopee" | "other" };

export function getExpenseBankName(expense: ExpenseHistoryEntry) {
  return expense.bankAssignment?.bank.name ?? expense.legacyBankName;
}

export function getExpensePaymentProvider(expense: ExpenseHistoryEntry): PaymentProvider | null {
  if (expense.payLaterProviderKey === "shopee") return { name: "Shopee", kind: "shopee" };

  const payLaterProviderName = expense.payLaterProviderName?.trim();
  if (payLaterProviderName) return { name: payLaterProviderName, kind: "other" };

  const bank = getExpenseBankName(expense)?.trim();
  return bank ? { name: bank, kind: "bank" } : null;
}

export default function ExpensePaymentProvider({ name, kind }: PaymentProvider) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {kind === "bank" && <BankLogo name={name} compact />}
      {kind === "shopee" && (
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-white">
          <Image src="/branding/shopee.svg" alt="" width={20} height={20} unoptimized className="size-5 object-contain" />
        </span>
      )}
      <span className="wrap-anywhere">{name}</span>
    </span>
  );
}
