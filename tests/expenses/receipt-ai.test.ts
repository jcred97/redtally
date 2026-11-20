import assert from "node:assert/strict";
import test from "node:test";
import { findReceiptBank, normalizeReceiptSuggestions } from "@/app/lib/receipt-scanning/suggestions";
import type { ExpenseBankOption } from "@/app/lib/expenses/payment";

test("AI order suggestions use the placed timestamp and never mix in a later clock time", () => {
  const order = {
    receiptType: "ORDER",
    orderDate: "2026-11-13",
    orderTime: "16:22",
    transactionDate: "2026-11-14",
    transactionTime: "09:00",
    deliveredDate: "2026-11-17",
    deliveredTime: "04:43",
  };
  const placed = normalizeReceiptSuggestions(order);
  assert.equal(placed.date, "2026-11-13");
  assert.equal(placed.time, "16:22");
  assert.equal(normalizeReceiptSuggestions({ ...order, receiptType: "TRANSACTION" }).date, "2026-11-13");
  assert.equal(normalizeReceiptSuggestions({ ...order, orderTime: null }).time, undefined);
  const missing = normalizeReceiptSuggestions({ ...order, orderDate: null, orderTime: null });
  assert.equal(missing.date, undefined);
  assert.equal(missing.time, undefined);
});

test("AI payment receipts retain a valid transaction timestamp and supported payment details", () => {
  const payment = {
    receiptType: "TRANSACTION",
    transactionDate: "2026-11-17",
    transactionTime: "09:05",
    amount: "2521",
    paymentMethod: "DEBIT_CARD",
    bank: "  BDO   Unibank  ",
  };
  const suggestions = normalizeReceiptSuggestions(payment);
  assert.equal(suggestions.date, "2026-11-17");
  assert.equal(suggestions.time, "09:05");
  assert.equal(suggestions.amount, "2521.00");
  assert.equal(suggestions.paymentMethod, "DEBIT_CARD");
  assert.equal(suggestions.bank, "BDO Unibank");
  assert.equal(normalizeReceiptSuggestions({ ...payment, paymentMethod: "CARD" }).paymentMethod, undefined);
  assert.equal(normalizeReceiptSuggestions({ ...payment, paymentMethod: "CASH" }).bank, undefined);
  assert.equal(normalizeReceiptSuggestions({ ...payment, bank: "1234" }).bank, undefined);
  assert.equal(normalizeReceiptSuggestions({ ...payment, transactionDate: "2026-02-30" }).date, undefined);
  assert.equal(normalizeReceiptSuggestions({ ...payment, transactionTime: "25:00" }).time, undefined);
});

test("bank suggestions match only an unambiguous bank enabled in the expense group", () => {
  const bdo: ExpenseBankOption = { id: 101, name: "BDO Unibank", paymentMethods: ["DEBIT_CARD"] };
  const unionBank: ExpenseBankOption = { id: 102, name: "UnionBank", paymentMethods: ["BANK_TRANSFER"] };
  const banks = [bdo, unionBank];
  assert.equal(findReceiptBank(" B.D.O. ", banks), bdo);
  assert.equal(findReceiptBank("Union Bank", banks), unionBank);
  assert.equal(findReceiptBank("Digital Union Bank", banks), undefined);
  assert.equal(findReceiptBank("GoTyme", banks), undefined);
  assert.equal(findReceiptBank("BDO", [...banks, { ...bdo, id: 103, name: "BDO" }]), undefined);
});
