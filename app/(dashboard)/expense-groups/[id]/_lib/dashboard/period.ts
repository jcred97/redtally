import { parseExpenseDate, parseExpenseDay, parseExpenseMonth } from "@/app/lib/expenses/date";

export function shiftDashboardMonth(month: string, offset: -1 | 1): string | undefined {
  if (!parseExpenseMonth(month)) return undefined;

  const date = parseExpenseDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return undefined;
  return date.toISOString().slice(0, 7);
}

export function lastDayOfDashboardMonth(month: string): string {
  const date = parseExpenseDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

export function getDashboardPeriod(month: string, today: string) {
  if (!parseExpenseMonth(month) || !parseExpenseDay(today)) return null;

  const currentMonth = today.slice(0, 7);
  const isCurrentMonth = month === currentMonth;
  const throughDay = isCurrentMonth ? today : lastDayOfDashboardMonth(month);
  const previousMonth = month <= currentMonth ? shiftDashboardMonth(month, -1) : undefined;
  const previousLastDay = previousMonth ? lastDayOfDashboardMonth(previousMonth) : undefined;
  const comparableDay = previousMonth && isCurrentMonth ? `${previousMonth}-${today.slice(-2)}` : undefined;

  return {
    month,
    throughDay,
    comparison: previousMonth && previousLastDay ? {
      month: previousMonth,
      throughDay: comparableDay && comparableDay < previousLastDay ? comparableDay : previousLastDay,
    } : null,
  };
}
