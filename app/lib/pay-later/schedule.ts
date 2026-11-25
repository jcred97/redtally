import { parseExpenseDay } from "../expenses/date";
import { MAX_AMOUNT_CENTAVOS } from "../expenses/money";

type SPayLaterScheduleInput = {
  completedOn: string;
  dueDay: number;
  months: number;
  amountCentavos: number;
};

function dateInMonth(date: Date, monthOffset: number, day: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + monthOffset, day);
  return result;
}

function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calculate a principal-only schedule for a completed SPayLater purchase. */
export function calculateSPayLaterSchedule({
  completedOn,
  dueDay,
  months,
  amountCentavos,
}: SPayLaterScheduleInput) {
  const completionDay = parseExpenseDay(completedOn);
  if (
    !completionDay ||
    (dueDay !== 5 && dueDay !== 15) ||
    ![1, 3, 6, 12].includes(months) ||
    !Number.isInteger(amountCentavos) ||
    amountCentavos <= 0 ||
    amountCentavos > MAX_AMOUNT_CENTAVOS
  ) return undefined;

  const completionDate = new Date(`${completionDay}T00:00:00.000Z`);
  const cutoffDay = dueDay === 5 ? 25 : 5;
  const dueMonthOffset = dueDay === 5 ? 1 : 0;
  // The cutoff day itself belongs to the period that starts that day.
  const firstPeriodOffset = completionDate.getUTCDate() < cutoffDay ? -1 : 0;
  const firstPeriodStart = dateInMonth(completionDate, firstPeriodOffset, cutoffDay);
  const finalDueDate = dateInMonth(firstPeriodStart, months + dueMonthOffset, dueDay);
  if (firstPeriodStart.getUTCFullYear() < 1 || finalDueDate.getUTCFullYear() > 9999) {
    return undefined;
  }

  const baseCentavos = Math.floor(amountCentavos / months);
  const remainderCentavos = amountCentavos % months;
  return Array.from({ length: months }, (_, index) => {
    const statementDate = dateInMonth(firstPeriodStart, index + 1, cutoffDay);
    return {
      periodStart: calendarDay(dateInMonth(firstPeriodStart, index, cutoffDay)),
      periodEnd: calendarDay(dateInMonth(statementDate, 0, cutoffDay - 1)),
      statementDate: calendarDay(statementDate),
      dueDate: calendarDay(dateInMonth(statementDate, dueMonthOffset, dueDay)),
      installmentNumber: index + 1,
      amountCentavos: baseCentavos + (index < remainderCentavos ? 1 : 0),
    };
  });
}
