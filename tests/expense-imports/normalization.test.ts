import assert from "node:assert/strict";
import test from "node:test";
import { expenseImportKey, normalizeExpenseImportRow } from "../../app/lib/expenses/import";

const values = { title: "  Market  ", amount: "₱1,250.05", date: "2026-11-16" };

test("import normalizes exact peso amounts and preserves the calendar day and source row", () => {
  assert.deepEqual(normalizeExpenseImportRow(3, values, "submission"), {
    rowNumber: 3,
    title: "Market",
    amount: "1250.05",
    date: "2026-11-16",
    submissionId: "submission",
  });
  assert.equal(expenseImportKey(" market ", "2026-11-16", 125005), expenseImportKey("Market", "2026-11-16", 125005));
});

test("the date order resolves ambiguous exported dates and rejects impossible dates", () => {
  const numeric = { ...values, date: "11/12/2026" };
  assert.throws(() => normalizeExpenseImportRow(3, numeric, "submission"), /Choose the date order/);
  assert.equal(normalizeExpenseImportRow(3, numeric, "submission", "mdy").date, "2026-11-12");
  assert.equal(normalizeExpenseImportRow(3, numeric, "submission", "dmy").date, "2026-12-11");
  assert.equal(normalizeExpenseImportRow(3, { ...values, date: "16/11/2026" }, "submission").date, "2026-11-16");
  assert.throws(() => normalizeExpenseImportRow(3, { ...values, date: "2026-02-29" }, "submission"), /valid expense date/);
});

test("import rejects foreign currencies, negative amounts, invalid grouping, and excess precision", () => {
  for (const amount of ["USD 1250.05", "-1250.05", "(1250.05)", "12,50.05", "1250.051", "0"]) {
    assert.throws(() => normalizeExpenseImportRow(3, { ...values, amount }, "submission"));
  }
});

test("optional merchants trim, preserve Unicode, and use manual expense validation", () => {
  assert.equal(normalizeExpenseImportRow(2, { ...values, merchant: "  Café 日本  " }, "id").merchant, "Café 日本");
  assert.equal(normalizeExpenseImportRow(2, { ...values, merchant: " \t " }, "id").merchant, null);
  assert.equal(normalizeExpenseImportRow(2, { ...values, merchant: "é".repeat(100) }, "id").merchant?.length, 100);
  assert.throws(() => normalizeExpenseImportRow(2, { ...values, merchant: "é".repeat(101) }, "id"), /100 characters/);
  assert.throws(() => normalizeExpenseImportRow(2, { ...values, merchant: "a\0b" }, "id"), /valid merchant/);
  assert.equal(expenseImportKey("Lunch", "2026-11-18", 100, " Café "), expenseImportKey("Lunch", "2026-11-18", 100, "café"));
  assert.notEqual(expenseImportKey("Lunch", "2026-11-18", 100, "Cafe A"), expenseImportKey("Lunch", "2026-11-18", 100, "Cafe B"));
  assert.equal(expenseImportKey("Lunch", "2026-11-18", 100), expenseImportKey("Lunch", "2026-11-18", 100, null));
});
