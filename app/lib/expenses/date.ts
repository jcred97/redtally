/** Store the selected calendar day at UTC midnight. */
export function parseExpenseDate(value: unknown): Date {
  if (typeof value !== "string") {
    throw new TypeError("Enter a valid expense date.");
  }

  const calendarDate = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate) || calendarDate.startsWith("0000-")) {
    throw new TypeError("Enter a valid expense date.");
  }

  const date = new Date(`${calendarDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== calendarDate) {
    throw new TypeError("Enter a valid expense date.");
  }

  return date;
}

export function parseExpenseDay(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length !== 10) return undefined;
  try {
    return parseExpenseDate(value).toISOString().slice(0, 10);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
}

export function parseExpenseMonth(value: unknown): string | undefined {
  if (typeof value === "string" && value.length === 7 && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return value;
  }
}

/** Optional Manila clock time, independent of the stored calendar day. */
export function parseExpenseTime(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length !== 5 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new TypeError("Enter a valid expense time.");
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function expenseTimeInput(timeMinutes: number | null): string {
  if (timeMinutes === null) return "";
  const hours = String(Math.floor(timeMinutes / 60)).padStart(2, "0");
  const minutes = String(timeMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatExpenseTime(timeMinutes: number): string {
  const hours = Math.floor(timeMinutes / 60);
  const minutes = String(timeMinutes % 60).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/** Use the Philippine calendar day for the new-expense form's default. */
export function getManilaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")!.value;
  const month = parts.find((part) => part.type === "month")!.value;
  const day = parts.find((part) => part.type === "day")!.value;

  return `${year}-${month}-${day}`;
}

/** Keep the stored calendar day unchanged across browser/server time zones. */
export function formatExpenseDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
