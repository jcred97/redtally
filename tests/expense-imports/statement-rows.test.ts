import assert from "node:assert/strict";
import test from "node:test";
import type { PdfTextPage } from "../../app/(dashboard)/expense-groups/[id]/_lib/pdf-text";
import { parseStatementRows } from "../../app/(dashboard)/expense-groups/[id]/_lib/statement-rows";

type Cell = [text: string, x: number, width?: number];

function line(y: number, ...cells: Cell[]): PdfTextPage["items"] {
  return cells.map(([text, x, width = text.length * 5]) => ({ text, x, y, width, height: 10 }));
}

function headings(y: number, debit = "Debit", credit = "Credit") {
  return line(y, ["Posting", 40], ["Date", 78], ["Description", 130], [debit, 325], [credit, 405], ["Balance", 495]);
}

test("extracts right-aligned debit rows in reading order across statement pages", () => {
  const firstPage = [
    ...line(30, ["Example Bank — November statement", 40]),
    ...headings(100, "Debit (PHP)"),
    ...line(125, ["2026-11-16", 40], ["Market", 130], ["purchase", 163], ["₱", 314], ["1,050.25", 322], ["9,500.75", 492]),
    ...line(135, ["Quezon City", 130]),
    ...line(155, ["2026-11-17", 40], ["Incoming transfer", 130], ["0.00", 342], ["12,500,000.00", 350, 85], ["12,509,500.75", 470]),
    ...line(230, ["2026-11-18", 40], ["Ending balance", 130], ["12,509,500.75", 470]),
  ];
  const secondPage = [
    ...headings(100, "Withdrawal"),
    ...line(125, ["19 Nov 2026", 40], ["Cash withdrawal", 130], ["1,000.00", 322], ["11,509,500.75", 470]),
    ...line(150, ["Nov 20, 2026", 40], ["Adjustment", 130], ["-100.00", 330], ["11,509,600.75", 470]),
    ...line(165, ["Nov 21, 2026", 40], ["Total debits", 130], ["2,050.25", 330]),
  ];

  assert.deepEqual(parseStatementRows([
    { pageNumber: 1, items: firstPage.reverse() },
    { pageNumber: 2, items: secondPage },
  ]), [
    { rowNumber: 1, cells: ["Date", "Description", "Debit"] },
    { rowNumber: 2, sourcePage: 1, cells: ["2026-11-16", "Market purchase Quezon City", "₱ 1,050.25"] },
    { rowNumber: 3, sourcePage: 2, cells: ["2026-11-19", "Cash withdrawal", "1,000.00"] },
    { rowNumber: 4, sourcePage: 2, cells: ["2026-11-20", "Adjustment", "-100.00"] },
  ]);
});

test("preserves ambiguous or invalid supported dates and debit strings for the normal preview", () => {
  assert.deepEqual(parseStatementRows([{ pageNumber: 1, items: [
    ...headings(100),
    ...line(125, ["11/12/2026", 40], ["Food", 130], ["12.001", 325]),
    ...line(150, ["2026-02-31", 40], ["Coffee", 130], ["1.00 CR", 325]),
  ] }]).slice(1).map(({ cells }) => cells), [
    ["11/12/2026", "Food", "12.001"], ["2026-02-31", "Coffee", "1.00 CR"],
  ]);
});

test("rejects generic amounts or explicit foreign currency instead of guessing direction or currency", () => {
  const payment = line(125, ["2026-11-16", 40], ["Food", 130], ["20.00", 325]);
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [...headings(100, "Amount"), ...payment] }]), /unsupported layout/);
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [...headings(100, "Debit (USD)"), ...payment] }]), /currency other than PHP/);
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [...line(25, ["Account Currency: EUR", 40]), ...headings(100), ...payment] }]), /currency other than PHP/);
});

test("rejects textless PDFs, credit-only statements, and unreadable later transaction tables", () => {
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [] }]), /no selectable text/);
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [
    ...headings(100),
    ...line(125, ["2026-11-16", 40], ["Transfer in", 130], ["—", 325], ["1,000.25", 405]),
  ] }]), /No debit rows/);
  assert.throws(() => parseStatementRows([
    { pageNumber: 1, items: [...headings(100), ...line(125, ["2026-11-16", 40], ["Food", 130], ["20.00", 325])] },
    { pageNumber: 2, items: line(110, ["2026-11-18", 40], ["Clothes", 130], ["30.00", 325]) },
  ]), /transaction table on page 2/);
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [
    ...headings(100),
    ...line(125, ["Nov 16", 40], ["Food", 130], ["20.00", 325]),
  ] }]), /transaction date on page 1/);
});

test("rejects a statement that exceeds the import row limit rather than truncating", () => {
  const payment = (index: number) => line(125 + index * 12, ["2026-11-16", 40], ["Food", 130], ["20.00", 325]);
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [
    ...headings(100), ...Array.from({ length: 501 }, (_, index) => payment(index)).flat(),
  ] }]), /up to 500 debit rows/);
});

test("rejects a transaction with both debit and credit values", () => {
  const ambiguous = line(125, ["2026-11-16", 40], ["Transfer", 130], ["100.00", 325], ["100.00", 405]);
  assert.throws(() => parseStatementRows([{ pageNumber: 1, items: [
    ...headings(100, "Debit", "Deposit Amount"), ...ambiguous,
  ] }]), /both debit and credit amounts/);
});
