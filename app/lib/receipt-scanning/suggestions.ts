import { parseExpenseDay, parseExpenseTime } from "@/app/lib/expenses/date";
import { formatPesoInput, parsePesoAmount } from "@/app/lib/expenses/money";
import { isPaymentMethod, type ExpenseBankOption } from "@/app/lib/expenses/payment";
import type { ReceiptSuggestions } from "./config";

function nameSuggestion(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text && text.length <= 100 ? text : undefined;
}

export function normalizeReceiptSuggestions(fields: Record<string, unknown>): ReceiptSuggestions {
  // An order confirmation can show several later events. Only use the order timestamp.
  const orderDate = parseExpenseDay(fields.orderDate);
  const isOrder = fields.receiptType === "ORDER" || orderDate !== undefined;
  const isTransaction = fields.receiptType === "TRANSACTION";
  const date = isOrder ? orderDate : isTransaction ? parseExpenseDay(fields.transactionDate) : undefined;
  const time = isOrder ? fields.orderTime : isTransaction ? fields.transactionTime : undefined;
  const paymentMethod = isPaymentMethod(fields.paymentMethod) ? fields.paymentMethod : undefined;
  const bank = nameSuggestion(fields.bank);
  const suggestions: ReceiptSuggestions = {
    title: nameSuggestion(fields.title),
    merchant: nameSuggestion(fields.merchant),
    date,
    paymentMethod,
    bank: paymentMethod !== "CASH" && paymentMethod !== "PAY_LATER" && bank && /\p{L}/u.test(bank) ? bank : undefined,
  };
  if (typeof fields.amount === "string" && fields.amount.length <= 20) {
    try { suggestions.amount = formatPesoInput(parsePesoAmount(fields.amount)); } catch { /* Skip invalid totals. */ }
  }
  if (typeof time === "string") {
    try {
      if (parseExpenseTime(time) !== null) suggestions.time = time;
    } catch { /* Skip invalid times. */ }
  }
  return suggestions;
}

const bankAliases = new Map([
  ["bankofthephilippineislands", "bpi"],
  ["bdo", "bdounibank"],
  ["cimb", "cimbbankphilippines"],
  ["gotyme", "gotymebank"],
  ["maribank", "maribankphilippines"],
  ["unionbankofthephilippines", "unionbank"],
]);

function bankMatchKey(name: string) {
  const normalized = name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return bankAliases.get(normalized) ?? normalized;
}

export function findReceiptBank(name: string, banks: readonly ExpenseBankOption[]) {
  const key = bankMatchKey(name);
  if (!key) return undefined;
  const matches = banks.filter((bank) => bankMatchKey(bank.name) === key);
  return matches.length === 1 ? matches[0] : undefined;
}
