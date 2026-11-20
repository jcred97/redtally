import { parseExpenseDate } from "@/app/lib/expenses/date";
import { MAX_AMOUNT_CENTAVOS, parsePesoAmount, sumCentavos } from "@/app/lib/expenses/money";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxInstallments = 120;

export function isLoanId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function readText(value: FormDataEntryValue | null, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 120) {
    throw new TypeError(`${label} must be between 1 and 120 characters.`);
  }
  return text;
}

export function readAmount(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim().length > 14) {
    throw new TypeError("Enter a valid peso amount.");
  }
  try {
    return parsePesoAmount(value);
  } catch (error) {
    if (error instanceof Error) throw new TypeError(error.message);
    throw error;
  }
}

export function readDate(value: FormDataEntryValue | null, label: string): Date {
  try {
    return parseExpenseDate(value);
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError(`Enter a valid ${label}.`);
    throw error;
  }
}

export function readSubmissionId(formData: FormData): string {
  const id = formData.get("submissionId");
  if (!isLoanId(id)) {
    throw new TypeError("Unable to identify this draft. Refresh the page and try again.");
  }
  return id.toLowerCase();
}

export type InstallmentInput = { dueDate: Date; amountCentavos: number };

export function readInstallments(formData: FormData, startDate: Date): InstallmentInput[] {
  const dates = formData.getAll("installmentDate");
  const amounts = formData.getAll("installmentAmount");
  if (!dates.length || dates.length > maxInstallments || dates.length !== amounts.length) {
    throw new TypeError(`Enter a schedule with 1 to ${maxInstallments} payments.`);
  }

  const installments = dates.map((date, index) => ({
    dueDate: readDate(date, "payment due date"),
    amountCentavos: readAmount(amounts[index]),
  })).sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());

  if (installments[0].dueDate < startDate) {
    throw new TypeError("Payments must be due on or after the purchase or loan date.");
  }
  if (new Set(installments.map(({ dueDate }) => dueDate.getTime())).size !== installments.length) {
    throw new TypeError("Enter a different due date for each scheduled payment.");
  }
  return installments;
}

export function validateInstallmentTotal(installments: InstallmentInput[], principal: number) {
  const total = sumCentavos(installments.map(({ amountCentavos }) => amountCentavos));
  if (total < principal) throw new TypeError("Scheduled payments must cover the full amount.");
  if (total > MAX_AMOUNT_CENTAVOS) throw new TypeError("The scheduled payment total is too large.");
}
