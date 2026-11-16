import { parseExpenseDate } from "./date";
import { formatPesoInput, parsePesoAmount } from "./money";

export const MAX_IMPORT_ROWS = 500;

export type ExpenseImportRow = {
  rowNumber: number;
  title: string;
  amount: string;
  date: string;
  submissionId: string;
};

export function expenseImportKey(title: string, date: string, amountCentavos: number): string {
  return JSON.stringify([title.trim().toLowerCase(), date, amountCentavos]);
}

export function normalizeExpenseImportRow(
  rowNumber: number,
  values: { title: string; amount: string; date: string },
  submissionId: string,
  dateOrder?: "mdy" | "dmy",
): ExpenseImportRow {
  const title = values.title.trim();
  if (!title || title.length > 100) {
    throw new TypeError("Enter a description of 1 to 100 characters.");
  }
  if (title.includes("\0")) {
    throw new TypeError("Description contains an invalid character.");
  }

  const rawDate = values.date.trim();
  const numericDate = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(rawDate);
  let calendarDate = rawDate;
  if (numericDate) {
    const [, first, , second, year] = numericDate;
    const resolvedOrder = dateOrder ?? (
      Number(first) > 12 ? "dmy" : Number(second) > 12 || Number(first) === Number(second) ? "mdy" : undefined
    );
    if (!resolvedOrder) {
      throw new TypeError("Choose the date order for this file.");
    }
    const [month, day] = resolvedOrder === "mdy" ? [first, second] : [second, first];
    calendarDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const date = parseExpenseDate(calendarDate).toISOString().slice(0, 10);

  const rawAmount = values.amount.trim().replace(/^(?:₱|PHP\b)\s*/i, "");
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(rawAmount)) {
    throw new TypeError("Enter a positive PHP amount with at most two decimal places.");
  }
  const amount = formatPesoInput(parsePesoAmount(rawAmount.replaceAll(",", "")));

  return { rowNumber, title, amount, date, submissionId };
}
