import type { FinancialAccountType } from "@/generated/prisma/enums";

export const financialAccountTypeLabels = {
  SAVINGS: "Savings",
  CHECKING: "Checking",
  WALLET: "E-wallet",
  CREDIT_CARD: "Credit card",
  CASH: "Cash",
  OTHER: "Other",
  PAY_LATER: "Pay Later",
} satisfies Record<FinancialAccountType, string>;

export const manualFinancialAccountTypes = (
  ["SAVINGS", "CHECKING", "WALLET", "CREDIT_CARD", "CASH", "OTHER"] as const
).map((value) => ({ value, label: financialAccountTypeLabels[value] }));

export function supportsFinancialAccountBank(type: string) {
  return type === "SAVINGS" || type === "CHECKING" || type === "CREDIT_CARD";
}
