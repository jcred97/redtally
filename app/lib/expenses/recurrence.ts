export const recurrenceFrequencies = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

export const recurrenceFrequencyLabels = {
  DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly",
} satisfies Record<RecurrenceFrequency, string>;

const MILLISECONDS_PER_DAY = 86_400_000;

function addAnchoredMonths(startDate: Date, months: number): Date {
  const date = new Date(startDate);
  const anchorDay = startDate.getUTCDate();

  // Find the target month's last day before applying the original day of the month.
  date.setUTCMonth(startDate.getUTCMonth() + months + 1, 0);
  date.setUTCDate(Math.min(anchorDay, date.getUTCDate()));

  return date;
}

/** All inputs and results are calendar dates represented at UTC midnight. */
export function getRecurringDateOnOrAfter(
  startDate: Date,
  frequency: RecurrenceFrequency,
  cutoff: Date,
): Date {
  if (cutoff <= startDate) return new Date(startDate);

  if (frequency === "DAILY" || frequency === "WEEKLY") {
    const interval = (frequency === "DAILY" ? 1 : 7) * MILLISECONDS_PER_DAY;
    const elapsed = cutoff.getTime() - startDate.getTime();
    return new Date(startDate.getTime() + Math.ceil(elapsed / interval) * interval);
  }

  const interval = frequency === "MONTHLY" ? 1 : 12;
  const elapsedMonths = (cutoff.getUTCFullYear() - startDate.getUTCFullYear()) * 12
    + cutoff.getUTCMonth() - startDate.getUTCMonth();
  const offset = Math.floor(elapsedMonths / interval) * interval;
  const candidate = addAnchoredMonths(startDate, offset);

  return candidate >= cutoff ? candidate : addAnchoredMonths(startDate, offset + interval);
}

export function getNextRecurringDate(
  dueDate: Date,
  frequency: RecurrenceFrequency,
  startDate: Date,
): Date {
  const nextDay = new Date(dueDate.getTime() + MILLISECONDS_PER_DAY);
  return getRecurringDateOnOrAfter(startDate, frequency, nextDay);
}
