import assert from "node:assert/strict";
import test from "node:test";
import { MAX_AMOUNT_CENTAVOS } from "../../app/lib/expenses/money";
import { calculateSPayLaterSchedule } from "../../app/lib/pay-later/schedule";

const purchase = { completedOn: "2026-06-26", dueDay: 5, months: 3, amountCentavos: 100_000 };

test("a June 26 purchase posts to three periods for its selected due day", () => {
  assert.deepEqual(calculateSPayLaterSchedule(purchase), [
    { periodStart: "2026-06-25", periodEnd: "2026-07-24", statementDate: "2026-07-25", dueDate: "2026-08-05", installmentNumber: 1, amountCentavos: 33_334 },
    { periodStart: "2026-07-25", periodEnd: "2026-08-24", statementDate: "2026-08-25", dueDate: "2026-09-05", installmentNumber: 2, amountCentavos: 33_333 },
    { periodStart: "2026-08-25", periodEnd: "2026-09-24", statementDate: "2026-09-25", dueDate: "2026-10-05", installmentNumber: 3, amountCentavos: 33_333 },
  ]);

  assert.deepEqual(calculateSPayLaterSchedule({ ...purchase, dueDay: 15 }), [
    { periodStart: "2026-06-05", periodEnd: "2026-07-04", statementDate: "2026-07-05", dueDate: "2026-07-15", installmentNumber: 1, amountCentavos: 33_334 },
    { periodStart: "2026-07-05", periodEnd: "2026-08-04", statementDate: "2026-08-05", dueDate: "2026-08-15", installmentNumber: 2, amountCentavos: 33_333 },
    { periodStart: "2026-08-05", periodEnd: "2026-09-04", statementDate: "2026-09-05", dueDate: "2026-09-15", installmentNumber: 3, amountCentavos: 33_333 },
  ]);
});

test("a purchase on a statement date starts the next billing period", () => {
  for (const [dueDay, completedOn, statementDate, dueDate] of [
    [5, "2026-06-24", "2026-06-25", "2026-07-05"],
    [5, "2026-06-25", "2026-07-25", "2026-08-05"],
    [15, "2026-07-04", "2026-07-05", "2026-07-15"],
    [15, "2026-07-05", "2026-08-05", "2026-08-15"],
  ] as const) {
    const schedule = calculateSPayLaterSchedule({ ...purchase, dueDay, completedOn, months: 1 });
    assert.equal(schedule?.[0].statementDate, statementDate);
    assert.equal(schedule?.[0].dueDate, dueDate);
  }
});

test("billing periods cross calendar years and support each installment term", () => {
  for (const [months, finalDueDate] of [
    [1, "2027-01-05"],
    [3, "2027-03-05"],
    [6, "2027-06-05"],
    [12, "2027-12-05"],
  ] as const) {
    const schedule = calculateSPayLaterSchedule({ ...purchase, completedOn: "2026-12-24", months });
    assert.ok(schedule);
    assert.equal(schedule.length, months);
    assert.equal(schedule[0].periodEnd, "2026-12-24");
    assert.equal(schedule[0].dueDate, "2027-01-05");
    assert.equal(schedule.at(-1)?.dueDate, finalDueDate);
    assert.equal(schedule.at(-1)?.installmentNumber, months);
    assert.equal(schedule.reduce((total, { amountCentavos }) => total + amountCentavos, 0), purchase.amountCentavos);
  }
});

test("centavos are distributed to the earliest installments when the amount is smaller than the term", () => {
  const schedule = calculateSPayLaterSchedule({ ...purchase, amountCentavos: 2 });
  assert.deepEqual(schedule?.map(({ amountCentavos }) => amountCentavos), [1, 1, 0]);
});

test("early calendar years and the maximum stored amount are valid", () => {
  const schedule = calculateSPayLaterSchedule({
    ...purchase, completedOn: "0099-12-24", months: 1, amountCentavos: MAX_AMOUNT_CENTAVOS,
  });
  assert.deepEqual(schedule, [
    { periodStart: "0099-11-25", periodEnd: "0099-12-24", statementDate: "0099-12-25", dueDate: "0100-01-05", installmentNumber: 1, amountCentavos: MAX_AMOUNT_CENTAVOS },
  ]);
});

test("invalid dates, unsupported options, and out-of-range amounts do not produce a schedule", () => {
  for (const input of [
    { completedOn: "2026-02-29" },
    { completedOn: "2026-6-26" },
    { completedOn: "2026-06-26T00:00:00Z" },
    { completedOn: "0000-12-31" },
    { completedOn: "0001-01-01" },
    { completedOn: "9999-10-24" },
    { completedOn: "9999-12-24" },
    { dueDay: 10 },
    { months: 0 },
    { months: 2 },
    { months: 3.5 },
    { amountCentavos: 0 },
    { amountCentavos: -1 },
    { amountCentavos: 100.5 },
    { amountCentavos: MAX_AMOUNT_CENTAVOS + 1 },
  ]) {
    assert.equal(calculateSPayLaterSchedule({ ...purchase, ...input }), undefined, JSON.stringify(input));
  }
});
