import assert from "node:assert/strict";
import test from "node:test";
import { parseExpenseDate } from "../../app/lib/expenses/date";
import {
  getNextRecurringDate,
  getRecurringDateOnOrAfter,
} from "../../app/lib/expenses/recurrence";

test("daily and weekly dates follow UTC calendar days across year boundaries", () => {
  const start = parseExpenseDate("2026-12-31");

  assert.deepEqual(getNextRecurringDate(start, "DAILY", start), parseExpenseDate("2027-01-01"));
  assert.deepEqual(getNextRecurringDate(start, "WEEKLY", start), parseExpenseDate("2027-01-07"));
  assert.deepEqual(start, parseExpenseDate("2026-12-31"));
});

test("monthly schedules restore their anchor day after a shorter month", () => {
  for (const [year, lastDayOfFebruary] of [[2024, 29], [2026, 28]]) {
    const start = parseExpenseDate(`${year}-01-31`);
    const february = getNextRecurringDate(start, "MONTHLY", start);

    assert.deepEqual(february, parseExpenseDate(`${year}-02-${lastDayOfFebruary}`));
    assert.deepEqual(getNextRecurringDate(february, "MONTHLY", start), parseExpenseDate(`${year}-03-31`));
  }
});

test("yearly schedules restore February 29 in the next leap year", () => {
  const start = parseExpenseDate("2024-02-29");

  assert.deepEqual(getNextRecurringDate(start, "YEARLY", start), parseExpenseDate("2025-02-28"));
  assert.deepEqual(
    getNextRecurringDate(parseExpenseDate("2027-02-28"), "YEARLY", start),
    parseExpenseDate("2028-02-29"),
  );
});

test("resumed schedules pick the first occurrence on or after the cutoff", () => {
  const start = parseExpenseDate("2024-01-31");

  assert.deepEqual(getRecurringDateOnOrAfter(start, "MONTHLY", parseExpenseDate("2024-01-01")), start);
  assert.deepEqual(
    getRecurringDateOnOrAfter(start, "MONTHLY", parseExpenseDate("2026-02-28")),
    parseExpenseDate("2026-02-28"),
  );
  assert.deepEqual(
    getRecurringDateOnOrAfter(start, "MONTHLY", parseExpenseDate("2026-03-01")),
    parseExpenseDate("2026-03-31"),
  );
  assert.deepEqual(
    getRecurringDateOnOrAfter(start, "WEEKLY", parseExpenseDate("2024-02-06")),
    parseExpenseDate("2024-02-07"),
  );
  assert.deepEqual(
    getRecurringDateOnOrAfter(start, "YEARLY", parseExpenseDate("2026-02-01")),
    parseExpenseDate("2027-01-31"),
  );
});

test("month arithmetic preserves calendar years before 0100", () => {
  const start = parseExpenseDate("0099-10-31");

  assert.deepEqual(getNextRecurringDate(start, "MONTHLY", start), parseExpenseDate("0099-11-30"));
  assert.deepEqual(getNextRecurringDate(start, "YEARLY", start), parseExpenseDate("0100-10-31"));
});
