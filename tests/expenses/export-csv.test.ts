import assert from "node:assert/strict";
import test from "node:test";
import Papa from "papaparse";
import type { ExpenseExportRow } from "../../app/(dashboard)/_lib/expense-groups/access";
import { expenseCsvResponse, expenseCsvRow } from "../../app/(dashboard)/spending/[id]/_lib/expenses/export";

const base: ExpenseExportRow = {
  id: 1, title: "Lunch", merchant: "Café 🍱", amountCentavos: 10,
  date: new Date("2026-11-18T23:59:59Z"), timeMinutes: 1439,
  notes: null, categoryName: "Food", paymentMethod: "CASH", bankName: null,
};

test("CSV preserves Unicode, quotes, line breaks, calendar days, and exact decimals", () => {
  const [row] = Papa.parse<string[]>(expenseCsvRow({ ...base, title: 'Rice, "large"', notes: "one\r\ntwo" }), { skipEmptyLines: true }).data;
  assert.deepEqual(row, ["2026-11-18", "23:59", 'Rice, "large"', "Café 🍱", "0.10", "Food", "Cash", "", "one\r\ntwo"]);
  assert.match(expenseCsvRow({ ...base, amountCentavos: 20 }), /"0\.20"/);
});

test("CSV neutralizes spreadsheet formulas in every user text field", () => {
  for (const text of ["=1+1", "+cmd", "-1+2", "@SUM(A1)", "  =SUM(A1)", "\t=1", "\r=1", "\n=1", "\u0000=1"]) {
    const [row] = Papa.parse<string[]>(expenseCsvRow({ ...base, title: text, merchant: text, categoryName: text, bankName: text, notes: text }), { skipEmptyLines: true }).data;
    for (const index of [2, 3, 5, 7, 8]) assert.equal(row[index], `'${text}`);
  }
});

test("canceling a CSV response closes its source without reading the complete history", async () => {
  let reads = 0;
  let closed = false;
  const response = expenseCsvResponse({
    publicId: "test",
    async *batches() {
      try { for (let n = 0; n < 100; n++) { reads++; yield [base]; } }
      finally { closed = true; }
    },
  });
  const reader = response.body!.getReader();
  await reader.read();
  await reader.read();
  await reader.cancel();
  assert.ok(reads <= 2);
  assert.equal(closed, true);
});
