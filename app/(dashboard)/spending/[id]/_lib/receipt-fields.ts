import { parseExpenseDay } from "@/app/lib/expenses/date";
import { formatPesoInput, parsePesoAmount } from "@/app/lib/expenses/money";

export type ReceiptSuggestions = { title?: string; amount?: string; date?: string };

const merchantLabel = /^(?:merchant(?: name)?|payee(?: name)?|vendor(?: name)?|store(?: name)?|biller(?: name)?|paid to)(?=$|[\s:=])/i;
const totalLabel = /^(?:total amount paid|amount paid|total paid|amount charged|grand total|total amount|net total|total|kabuuang halaga|halagang binayaran)\b/i;
const dateLabel = /^(?:(?:transaction|purchase|receipt|invoice) date(?:\s*(?:and|[&/])\s*time)?|date\s*\/\s*time|date|paid on)\b/i;
const currencyLabel = /^(?:(?:transaction|account|receipt)\s+)?(?:currency|ccy)(?=$|[\s:=])/i;
const nonExpenseStatus = /^(?:(?:full |partial )?refund(?:ed)?(?:\s+(?:successful|processed|completed|receipt))?|(?:payment|transaction)\s+(?:failed|cancelled|canceled|pending|declined)|(?:payment|transaction)\s+status\s*:\s*(?:failed|cancelled|canceled|pending|declined)|money received|payment received|(?:cash[ -]?in)\s+(?:successful|completed|receipt))\b/i;
const foreignMoney = /(?:[$€£¥₩฿₹₫₽]\s*\d|\d[\d,.]*\s*[$€£¥₩฿₹₫₽])/;
const currencyCodes = new Set(Intl.supportedValuesOf("currency"));
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function singleValue(values: Iterable<string>) {
  const distinct = new Set(values);
  if (distinct.size === 1) return distinct.values().next().value;
}

function getLabeledValues(lines: string[], label: RegExp) {
  return lines.flatMap((line, index) => {
    const match = label.exec(line);
    if (!match) return [];
    const remainder = line.slice(match[0].length).replace(/^\s*[:=]\s*/, "").trim();
    return [remainder || lines[index + 1] || ""];
  });
}

function readTitle(lines: string[]) {
  const validTitle = (value: string) => value.length <= 100 && /\p{L}{2}/u.test(value) &&
    !dateLabel.test(value) && !totalLabel.test(value) &&
    !/^(?:gcash|maya|merchant|vendor|payee|biller|store|receipt|invoice|transaction|info|details|n\/?a|(?:payment|transaction) successful)$/i.test(value) &&
    !/^(?:merchant|vendor|payee|biller|store|receipt|invoice|transaction|date|total|ref(?:erence)?)(?:\s*:|\s+(?:no\.?|number|date|\d))/i.test(value);
  const labeled = getLabeledValues(lines, merchantLabel);
  if (labeled.length) return singleValue(labeled.filter(validTitle));

  // A printed receipt often has an unlabeled business name near the top.
  const heading = lines.slice(0, 4).find((line) => !/^(?:(?:official|sales|cash|vat|tax)\s+)*(?:receipt|invoice)\b/i.test(line));
  if (heading && validTitle(heading) && /\b(?:cafe|café|restaurant|mart|store|market|supermarket|pharmacy|bakery|shop|diner|grill|inc\.?|corp\.?)\b/i.test(heading)) {
    return heading;
  }
}

function hasForeignCurrency(lines: string[]) {
  const declared = getLabeledValues(lines, currencyLabel).filter(Boolean);
  if (declared.some((value) => !/^(?:PHP\b.*|Philippine pesos?|₱)$/i.test(value))) return true;

  return lines.some((line) => {
    if (foreignMoney.test(line)) return true;
    const codes = line.matchAll(/\b([A-Z]{3})(?=\s*[-+]?\d)|\d[\d,.]*\s*\b([A-Z]{3})\b/gi);
    return Array.from(codes, (match) => (match[1] ?? match[2]).toUpperCase())
      .some((code) => code !== "PHP" && currencyCodes.has(code));
  });
}

function readAmount(value: string) {
  const amount = /^(?:(?:₱|PHP\b|P(?=\s*\d))\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s*(?:PHP|pesos?))?$/i.exec(value)?.[1];
  if (!amount) return undefined;
  try {
    return formatPesoInput(parsePesoAmount(amount.replaceAll(",", "")));
  } catch {
    return undefined;
  }
}

function isoDate(year: string, month: string, day: string) {
  return parseExpenseDay(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
}

function readDate(value: string) {
  const calendar = value.replace(/(?:\s*[,·|]\s*|\s+)(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?(?:\s+(?:PHT|GMT\+8|UTC\+8))?$/i, "");
  const yearFirst = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/.exec(calendar);
  if (yearFirst) return isoDate(yearFirst[1], yearFirst[3], yearFirst[4]);

  const numeric = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/.exec(calendar);
  if (numeric) {
    const [, first, , second, year] = numeric;
    if (Number(first) > 12) return isoDate(year, second, first);
    if (Number(second) > 12 || Number(first) === Number(second)) return isoDate(year, first, second);
    return undefined;
  }

  const monthFirst = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(calendar);
  const dayFirst = /^(\d{1,2})[ -]([a-z]+)\.?[ -](\d{4})$/i.exec(calendar);
  const monthName = monthFirst?.[1] ?? dayFirst?.[2];
  if (!monthName || !/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i.test(monthName)) return undefined;
  const month = months.indexOf(monthName.slice(0, 3).toLowerCase()) + 1;
  return isoDate(monthFirst?.[3] ?? dayFirst![3], String(month), monthFirst?.[2] ?? dayFirst![1]);
}

function validValues(values: string[], read: (value: string) => string | undefined) {
  return values.flatMap((value) => {
    const parsed = read(value);
    return parsed === undefined ? [] : [parsed];
  });
}

export function suggestReceiptFields(text: string): ReceiptSuggestions {
  const lines = text.normalize("NFKC").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.some((line) => nonExpenseStatus.test(line))) return {};

  const title = readTitle(lines);
  const amount = hasForeignCurrency(lines) ? undefined : singleValue(validValues(getLabeledValues(lines, totalLabel), readAmount));
  const labeledDates = getLabeledValues(lines, dateLabel);
  const date = singleValue(validValues(labeledDates.length ? labeledDates : lines, readDate));

  return {
    ...(title ? { title } : {}),
    ...(amount ? { amount } : {}),
    ...(date ? { date } : {}),
  };
}
