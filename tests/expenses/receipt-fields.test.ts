import assert from "node:assert/strict";
import test from "node:test";
import { suggestReceiptFields } from "../../app/(dashboard)/spending/[id]/_lib/receipt-fields";

test("suggests the merchant, paid total, and calendar day of a printed receipt", () => {
  assert.deepEqual(suggestReceiptFields([
    "Merchant: Pine Street Cafe", "Date: 2026-11-16", "Subtotal: 200.00", "VAT 24.00",
    "Total Paid: PHP 224.00", "Cash: 500.00", "Change: 276.00",
  ].join("\n")), { merchant: "Pine Street Cafe", amount: "224.00", date: "2026-11-16" });
});

test("handles separate e-wallet label and value lines and repeated equivalent totals", () => {
  assert.deepEqual(suggestReceiptFields([
    "GCash", "Payment Successful", "Paid to", "7-Eleven", "Nov 16, 2026 · 9:36 AM",
    "Total Amount", "₱1,024.25", "Amount Paid: P 1,024.25", "Convenience Fee: PHP 15.00",
  ].join("\n")), { merchant: "7-Eleven", amount: "1024.25", date: "2026-11-16", time: "09:36" });
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
  ].join("\n")), { merchant: "PINE STREET CAFE", amount: "200.00", date: "2026-11-16" });
});

test("uses the order timestamp over payment, shipment, and delivery timestamps", () => {
  assert.deepEqual(suggestReceiptFields([
    "Shopee Order Details", "Date Delivered: 2026-11-19 4:43 AM",
    "Order Time", "Nov 13, 2026 4:22 PM", "Paid on: 2026-11-14 09:00", "Shipped on: 2026-11-16",
  ].join("\n")), { date: "2026-11-13", time: "16:22" });
  assert.deepEqual(suggestReceiptFields("Order Date: 2026-11-13\nOrder Time: 16:22"), { date: "2026-11-13", time: "16:22" });
  assert.deepEqual(suggestReceiptFields("Order Created Time: Nov 13, 2026 4:22 PM"), { date: "2026-11-13", time: "16:22" });
  assert.deepEqual(suggestReceiptFields("Order Date: 2026-11-13\nPayment Time: 9:00 AM\nDelivered 2026-11-19"), { date: "2026-11-13" });
  assert.deepEqual(suggestReceiptFields("Order Placed: unknown\nDate Delivered: 2026-11-19"), {});
  assert.deepEqual(suggestReceiptFields("Order Date: 2026-11-13\nOrdered on: 2026-11-14 9:05 AM"), {});
  assert.deepEqual(suggestReceiptFields("Order Time: 2026-11-13 16:22\nTimezone: UTC"), { date: "2026-11-13" });
});

test("keeps ordinary payment timestamps and ignores delivery-only dates and clocks", () => {
  assert.deepEqual(suggestReceiptFields("Delivery Date\n2026-11-19 04:43\nTime: 04:43"), {});
  assert.deepEqual(suggestReceiptFields("Delivery Date & Time\nNov 19, 2026 4:43 AM"), {});
  assert.deepEqual(suggestReceiptFields("Delivered\nDate: 2026-11-19\nTime: 04:43"), {});
  assert.deepEqual(suggestReceiptFields("Delivered\nTime\n04:43\nDate\n2026-11-19"), {});
  assert.deepEqual(suggestReceiptFields("Delivered\nTime: 04:43\nDate: 2026-11-19\nPayment Date: 2026-11-13"), { date: "2026-11-13" });
  assert.deepEqual(suggestReceiptFields("Date of delivery: 2026-11-19 04:43"), {});
  assert.deepEqual(suggestReceiptFields("Delivery Date: 2026-11-19\nPayment Date: 2026-11-13\nPayment Time: 16:22"), { date: "2026-11-13", time: "16:22" });
});

test("reads the order timestamp immediately before the placed event on a tracking timeline", () => {
  assert.deepEqual(suggestReceiptFields([
    "11/18/2026 15:42 Delivered", "Parcel has been delivered",
    "11/17/2026 08:57 Preparing to ship", "5 11/17/2026 04:43 Order placed", "Order is placed",
  ].join("\n")), { date: "2026-11-17", time: "04:43" });
  assert.deepEqual(suggestReceiptFields("11/18/2026 15:42 Delivered"), {});
  assert.deepEqual(suggestReceiptFields("11/18/2026 15:42\nOrder delivered\n117720260443 Order placed"), {});
  assert.deepEqual(suggestReceiptFields("Date: 2026-11-18\n117720260443 Order placed"), {});
});

test("suggests explicitly shown payment methods and banks from OCR text", () => {
  assert.deepEqual(suggestReceiptFields("Payment Method\nBDO Debit Card"), { paymentMethod: "DEBIT_CARD", bank: "BDO" });
  assert.deepEqual(suggestReceiptFields("Payment Method: BDO Debit Card ending in 1234"), { paymentMethod: "DEBIT_CARD", bank: "BDO" });
  assert.deepEqual(suggestReceiptFields("Paid with: Credit Card (BPI)"), { paymentMethod: "CREDIT_CARD", bank: "BPI" });
  assert.deepEqual(suggestReceiptFields("Mode of Payment: Bank Transfer\nBank Name\nUnionBank"), { paymentMethod: "BANK_TRANSFER", bank: "UnionBank" });
  assert.deepEqual(suggestReceiptFields("Payment Method: Bank Payment - GoTyme"), { paymentMethod: "BANK_PAYMENT", bank: "GoTyme" });
  assert.deepEqual(suggestReceiptFields("Payment Method: Cash on Delivery\nBank: BDO"), { paymentMethod: "CASH" });
  assert.deepEqual(suggestReceiptFields("Payment Method: Credit/Debit Card\nIssuing Bank: BPI"), { bank: "BPI" });
});

test("omits ambiguous methods and unsupported payment and bank evidence", () => {
  for (const method of ["Visa", "PayLater", "GCash", "Online Banking", "Credit or Debit Card", "Credit & Debit Card", "Bank Transfer or Cash"]) {
    assert.deepEqual(suggestReceiptFields(`Payment Method: ${method}`), {});
  }
  assert.deepEqual(suggestReceiptFields("Payment Method: Credit Card\nPaid via: Bank Transfer"), {});
  assert.deepEqual(suggestReceiptFields("Payment Method: Debit Card - Visa\nCard Issuer: VISA"), { paymentMethod: "DEBIT_CARD" });
  assert.deepEqual(suggestReceiptFields("Bank: BPI 1234\nRecipient Bank: BDO"), {});
  assert.deepEqual(suggestReceiptFields("Card Issuer: Visa Debit Card"), {});
  assert.deepEqual(suggestReceiptFields("Bank: BPI\nIssuing Bank: BDO"), {});
  assert.deepEqual(suggestReceiptFields("Title\nPayment Method: Cash"), { paymentMethod: "CASH" });
});

test("suggests the labeled title and merchant independently", () => {
  assert.deepEqual(suggestReceiptFields("Merchant: Pine Street Cafe\nTitle: Team lunch"), { title: "Team lunch", merchant: "Pine Street Cafe" });
  assert.deepEqual(suggestReceiptFields("Transaction Description\nMonthly internet bill"), { title: "Monthly internet bill" });
  assert.deepEqual(suggestReceiptFields("Description: Airport taxi"), { title: "Airport taxi" });
  assert.deepEqual(suggestReceiptFields("Description\nLatte 150.00\nTotal: 150.00"), { amount: "150.00" });
  assert.deepEqual(suggestReceiptFields("Title\nMerchant Name: Pine Street Cafe"), { merchant: "Pine Street Cafe" });
  assert.deepEqual(suggestReceiptFields("Title: Team lunch\nTransaction Description: Office supplies\nMerchant: Pine Street Cafe"), { merchant: "Pine Street Cafe" });
  assert.deepEqual(suggestReceiptFields("Title: Airport ride\nMerchant: Grab\nPaid to: Grab"), { title: "Airport ride", merchant: "Grab" });
  assert.deepEqual(suggestReceiptFields("Title: Airport ride\nMerchant: Grab\nPaid to: Shopee"), { title: "Airport ride" });
  assert.deepEqual(suggestReceiptFields("Title\nPaid To\nH&M"), { merchant: "H&M" });
  assert.deepEqual(suggestReceiptFields(`Vendor: ${"A".repeat(101)}`), {});
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
