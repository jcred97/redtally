import assert from "node:assert/strict";
import test from "node:test";
import { suggestReceiptFields } from "../../app/(dashboard)/spending/[id]/_lib/receipt-fields";

test("suggests the merchant, paid total, and calendar day of a printed receipt", () => {
  assert.deepEqual(suggestReceiptFields([
    "Merchant: Pine Street Cafe", "Date: 2026-11-16", "Subtotal: 200.00", "VAT 24.00",
    "Total Paid: PHP 224.00", "Cash: 500.00", "Change: 276.00",
  ].join("\n")), { title: "Pine Street Cafe", amount: "224.00", date: "2026-11-16" });
});

test("handles separate e-wallet label and value lines and repeated equivalent totals", () => {
  assert.deepEqual(suggestReceiptFields([
    "GCash", "Payment Successful", "Paid to", "7-Eleven", "Nov 16, 2026 · 9:36 AM",
    "Total Amount", "₱1,024.25", "Amount Paid: P 1,024.25", "Convenience Fee: PHP 15.00",
  ].join("\n")), { title: "7-Eleven", amount: "1024.25", date: "2026-11-16" });
});

test("can use a business header and an unambiguous day-first date", () => {
  assert.deepEqual(suggestReceiptFields([
    "SALES INVOICE", "PINE STREET CAFE", "Receipt Date 16/11/2026", "Kabuuang Halaga: 200 pesos",
  ].join("\n")), { title: "PINE STREET CAFE", amount: "200.00", date: "2026-11-16" });
});

test("omits conflicting totals, ambiguous dates, and fields with only incidental evidence", () => {
  assert.deepEqual(suggestReceiptFields([
    "GCash", "Date: 11/12/2026", "Grand Total: 200.00", "Amount Paid: 215.00", "Subtotal: 180.00",
  ].join("\n")), {});
  assert.deepEqual(suggestReceiptFields("Date: 2026-02-29\nCash tendered: 500.00\nChange: 200.00"), {});
  assert.deepEqual(suggestReceiptFields("Total: 100.01\nDate: 2026-11-16\nPaid on: 2026-11-17"), { amount: "100.01" });
});

test("omits invalid or foreign-currency amounts and skips refunds and incoming payments", () => {
  for (const raw of ["- 100.00", "(100.00)", "USD 100.00", "100.00 USD", "$100.00", "100.00 EUR", "1,20.00", "100.001", "0.00"]) {
    assert.deepEqual(suggestReceiptFields(`Total: ${raw}`), {});
  }
  assert.deepEqual(suggestReceiptFields("Currency: EUR\nTotal: 100.00\nDate: 2026-11-16"), { date: "2026-11-16" });
  assert.deepEqual(suggestReceiptFields("Currency\nUS Dollar\nTotal: 100.00"), {});
  assert.deepEqual(suggestReceiptFields("Currency: Philippine Peso\nTotal: 100.00"), { amount: "100.00" });
  assert.deepEqual(suggestReceiptFields("Subtotal: usd 20.00\nTotal: 25.00"), {});
  for (const status of ["Refund successful", "Payment failed", "Payment status: Pending", "Money received", "Cash-in successful"]) {
    assert.deepEqual(suggestReceiptFields(`${status}\nAmount Paid: PHP 100.00\nDate: 2026-11-16`), {});
  }
});
