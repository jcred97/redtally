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
  ].join("\n")), { title: "7-Eleven", amount: "1024.25", date: "2026-11-16", time: "09:36" });
});

test("normalizes labeled receipt times and preserves the printed calendar day", () => {
  assert.deepEqual(suggestReceiptFields("Date/Time: 2026-11-16 7:05 PM"), { date: "2026-11-16", time: "19:05" });
  assert.deepEqual(suggestReceiptFields("Date: 2026-11-16 Time: 7:05 PM"), { date: "2026-11-16", time: "19:05" });
  assert.deepEqual(suggestReceiptFields("Receipt time\n7:05:24 P.M. GMT+08:00"), { time: "19:05" });
  assert.deepEqual(suggestReceiptFields("Paid on: 2026-11-16T19:05:24+08:00"), { date: "2026-11-16", time: "19:05" });
  assert.deepEqual(suggestReceiptFields("Date: 2026-11-16 7:05 PM\nTransaction Time: 19:05 PHT"), { date: "2026-11-16", time: "19:05" });
  assert.deepEqual(suggestReceiptFields("Time: 12:00 AM"), { time: "00:00" });
  assert.deepEqual(suggestReceiptFields("Time: 12:00 PM"), { time: "12:00" });
});

test("omits ambiguous, unrelated, malformed, and foreign clock times", () => {
  for (const clock of ["24:00", "19:65", "19:05:99", "00:30 AM", "13:02 PM", "4:30 GMT+0", "19:05Z", "19:05 PST"]) {
    assert.deepEqual(suggestReceiptFields(`Date: 2026-11-16 ${clock}`), { date: "2026-11-16" });
  }
  assert.deepEqual(suggestReceiptFields("Date: 2026-11-16 19:05\nTransaction time: 20:00"), { date: "2026-11-16" });
  assert.deepEqual(suggestReceiptFields("Date: 2026-11-16\nReceipt time: 19:05\nTimezone: UTC"), { date: "2026-11-16" });
  assert.deepEqual(suggestReceiptFields("Date: 2026-11-16\n19:05\nOpening hours: 09:00–18:00"), { date: "2026-11-16" });
  assert.deepEqual(suggestReceiptFields("Paid on: 2026-11-16T19:05:24-08:00"), { date: "2026-11-16" });
  assert.deepEqual(suggestReceiptFields("Date/Time: 11/12/2026 7:05 PM"), { time: "19:05" });
});

test("can use a business header and an unambiguous day-first date", () => {
  assert.deepEqual(suggestReceiptFields([
    "SALES INVOICE", "PINE STREET CAFE", "Receipt Date 16/11/2026", "Kabuuang Halaga: 200 pesos",
  ].join("\n")), { title: "PINE STREET CAFE", amount: "200.00", date: "2026-11-16" });
});

test("uses a labeled title or transaction description, with the merchant as a fallback", () => {
  assert.deepEqual(suggestReceiptFields("Merchant: Pine Street Cafe\nTitle: Team lunch"), { title: "Team lunch" });
  assert.deepEqual(suggestReceiptFields("Transaction Description\nMonthly internet bill"), { title: "Monthly internet bill" });
  assert.deepEqual(suggestReceiptFields("Description: Airport taxi"), { title: "Airport taxi" });
  assert.deepEqual(suggestReceiptFields("Description\nLatte 150.00\nTotal: 150.00"), { amount: "150.00" });
  assert.deepEqual(suggestReceiptFields("Title\nMerchant: Pine Street Cafe"), { title: "Pine Street Cafe" });
  assert.deepEqual(suggestReceiptFields("Title: Team lunch\nTransaction Description: Office supplies\nMerchant: Pine Street Cafe"), { title: "Pine Street Cafe" });
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
