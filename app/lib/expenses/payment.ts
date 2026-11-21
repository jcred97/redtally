import type { BankAssignment } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";

export const paymentMethodLabels = {
  CASH: "Cash",
  DEBIT_CARD: "Debit card",
  CREDIT_CARD: "Credit card",
  BANK_TRANSFER: "Bank transfer",
  BANK_PAYMENT: "Bank payment",
  PAY_LATER: "Pay Later",
} satisfies Record<PaymentMethod, string>;

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && Object.hasOwn(paymentMethodLabels, value);
}

export const bankPaymentMethodFields = {
  DEBIT_CARD: "supportedDebitCard",
  CREDIT_CARD: "supportedCreditCard",
  BANK_TRANSFER: "supportedBankTransfer",
  BANK_PAYMENT: "supportedBankPayment",
} as const satisfies Record<Exclude<PaymentMethod, "CASH" | "PAY_LATER">, string>;

export type BankPaymentMethod = keyof typeof bankPaymentMethodFields;

export function isBankPaymentMethod(value: unknown): value is BankPaymentMethod {
  return typeof value === "string" && Object.hasOwn(bankPaymentMethodFields, value);
}

export type BankAssignmentOption = Pick<BankAssignment, "id"> & {
  name: string;
  paymentMethods: BankPaymentMethod[];
};
