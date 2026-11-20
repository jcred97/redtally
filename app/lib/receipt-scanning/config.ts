import type { PaymentMethod } from "@/generated/prisma/enums";

export const providers = { openai: "OpenAI", anthropic: "Anthropic" } as const;
export type ReceiptProvider = keyof typeof providers;
export type ReceiptConnection = { provider: ReceiptProvider; keySuffix: string };
export type ReceiptSuggestions = {
  title?: string;
  merchant?: string;
  amount?: string;
  date?: string;
  time?: string;
  paymentMethod?: PaymentMethod;
  bank?: string;
};

export const receiptImageTypes = ["image/png", "image/jpeg", "image/webp"];
export const maxAiImageBytes = 4 * 1024 * 1024;
export const maxReceiptImagePixels = 16_000_000;

export function isReceiptProvider(value: unknown): value is ReceiptProvider {
  return typeof value === "string" && Object.hasOwn(providers, value);
}
