import { parseExpenseDate } from "@/app/lib/expenses/date";
import { calculateSPayLaterSchedule } from "@/app/lib/pay-later/schedule";

export type SPayLaterInputs = {
  spayLaterDueDay?: unknown;
  spayLaterMonths?: unknown;
  spayLaterCompletedOn?: unknown;
};

type SPayLaterTerms = {
  spayLaterDueDay: number | null;
  spayLaterMonths: number | null;
  spayLaterCompletedOn: Date | null;
};

type Purchase = { amountCentavos: number; date: Date };

const noSchedule: SPayLaterTerms = {
  spayLaterDueDay: null,
  spayLaterMonths: null,
  spayLaterCompletedOn: null,
};

export function readSPayLaterTerms(
  input: SPayLaterInputs,
  providerKey: string | null,
  previous: SPayLaterTerms = noSchedule,
): SPayLaterTerms {
  const { spayLaterDueDay, spayLaterMonths, spayLaterCompletedOn } = input;
  const hasInputs = spayLaterDueDay !== undefined || spayLaterMonths !== undefined || spayLaterCompletedOn !== undefined;
  if (providerKey !== "shopee") {
    if (hasInputs) throw new TypeError("Installment details are only available for SPayLater.");
    return noSchedule;
  }
  if (!hasInputs && previous.spayLaterDueDay === null) return noSchedule;

  const dueDay = spayLaterDueDay === undefined ? previous.spayLaterDueDay
    : spayLaterDueDay === "5" || spayLaterDueDay === "15" ? Number(spayLaterDueDay) : null;
  if (dueDay === null) throw new TypeError("Choose the 5th or 15th as the SPayLater due day.");

  const months = spayLaterMonths === undefined ? previous.spayLaterMonths
    : typeof spayLaterMonths === "string" && /^(1|3|6|12)$/.test(spayLaterMonths) ? Number(spayLaterMonths) : null;
  if (months === null) throw new TypeError("Choose a valid SPayLater payment term.");

  const completedOn = spayLaterCompletedOn === undefined ? previous.spayLaterCompletedOn
    : spayLaterCompletedOn === "" ? null : parseExpenseDate(spayLaterCompletedOn);
  return { spayLaterDueDay: dueDay, spayLaterMonths: months, spayLaterCompletedOn: completedOn };
}

function completionDay(purchase: Purchase, terms: SPayLaterTerms) {
  return (terms.spayLaterCompletedOn ?? purchase.date).toISOString().slice(0, 10);
}

export function calculateExpenseInstallments(purchase: Purchase, terms: SPayLaterTerms) {
  const { spayLaterDueDay: dueDay, spayLaterMonths: months } = terms;
  if (dueDay === null || months === null) return undefined;

  const schedule = calculateSPayLaterSchedule({
    completedOn: completionDay(purchase, terms),
    dueDay,
    months,
    amountCentavos: purchase.amountCentavos,
  });
  if (!schedule) throw new TypeError("The SPayLater schedule is outside the supported date range.");
  return { dueDay, schedule };
}

export function expenseScheduleChanged(previous: Purchase & SPayLaterTerms, purchase: Purchase, terms: SPayLaterTerms) {
  return previous.spayLaterDueDay !== terms.spayLaterDueDay
    || previous.spayLaterMonths !== terms.spayLaterMonths
    || (terms.spayLaterDueDay !== null && (
      previous.amountCentavos !== purchase.amountCentavos
      || completionDay(previous, previous) !== completionDay(purchase, terms)
    ));
}
