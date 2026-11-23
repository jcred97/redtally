import { parseExpenseDay, parseExpenseTime } from "@/app/lib/expenses/date";
import { formatPesoInput, parsePesoAmount } from "@/app/lib/expenses/money";
import type { ReceiptSuggestions } from "@/app/lib/receipt-scanning/config";
import type { PaymentMethod } from "@/generated/prisma/enums";

const titleLabel = /^(?:(?:expense|transaction|payment|purchase) (?:title|description)(?=$|[\s:=])|title(?=$|\s*[:=])|description(?=\s*[:=]))/i;
const merchantLabel = /^(?:merchant(?: name)?|payee(?: name)?|vendor(?: name)?|store(?: name)?|biller(?: name)?|paid to)(?=$|[\s:=])/i;
const totalLabel = /^(?:total amount paid|amount paid|total paid|amount charged|grand total|total amount|net total|total|kabuuang halaga|halagang binayaran)\b/i;
const orderTotalLabel = /^order total\b/i;
const shopLink = /\bview shop\b/i;
const shopeeCheckoutLabels = [
  /^merchandise subtotal\b/i,
  /^shipping fee\b/i,
  /\bshipping discount subtotal(?:\s*\([^)]*\))?/i,
  /^shopee voucher applied\b/i,
] as const;
const dateLabel = /^(?:(?:(?:transaction|purchase|payment|receipt|invoice) )?date(?:\s*(?:and|[&/])\s*time)?|paid on)\b/i;
const timeLabel = /^(?:(?:transaction|purchase|receipt|invoice|payment) time|time of (?:transaction|purchase|payment)|time|paid at)(?=$|\s*[:=]|\s+\d)/i;
const orderTimestampLabel = /^(?:order\s+(?:date(?:\s*(?:and|[&/])\s*time)?|time|(?:placed|created)(?:\s+(?:date|time|on|at))?)|ordered\s+(?:on|at)|placed\s+on|(?:date|time)\s+ordered)\b/i;
const fulfillmentLabel = /^(?:(?:date|time)\s+(?:of\s+)?)?(?:order\s+|parcel\s+(?:has\s+been\s+)?)?(?:deliver(?:y|ed)|ship(?:ped|ment|ping)|dispatch(?:ed)?|received|completed?|completion|tracking|estimated delivery|eta)(?:\s+(?:date(?:\s*(?:and|[&/])\s*time)?|time|on|at))?(?=$|\s*[:=]|\s+\d|\s+[a-z]{3,9}\.?\s+\d)/i;
const timelineTimestamp = /(?:^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)\s*[.·|–—-]?\s+(.*\S)$/i;
const orderPlacedEvent = /^order\s+(?:is\s+)?placed[.!]?$/i;
const paymentLabel = /^(?:payment\s+method|(?:mode|method)\s+of\s+payment|payment\s+mode|tender\s+type|paid\s+(?:by|with|via))(?=$|[\s:=])/i;
const bankLabel = /^(?:(?:bank\s+name|issuing\s+bank|payment\s+bank|card\s+issuer)(?=$|[\s:=])|bank(?=$|\s*[:=]))/i;
const timeZoneLabel = /^(?:(?:transaction|receipt) )?(?:time\s*zone|tz)(?=$|[\s:=])/i;
const manilaTimeZone = /^(?:pht|phst|asia\/manila|manila(?: time)?|philippine standard time|(?:utc|gmt)?\s*\+\s*0?8(?::?00)?)$/i;
const dateAndClock = /^(.+?)(?:\s*[,·|]\s*|\s+|(?<=\d)T)(?:at\s+|(?:order\s+)?time\s*[:=]\s*)?(\d{1,2}:\d{2}.*)$/i;
const ambiguousNumericDate = /^(?:0?[1-9]|1[0-2])([-/.])(?:0?[1-9]|1[0-2])\1(?!0000)\d{4}$/;
const currencyLabel = /^(?:(?:transaction|account|receipt)\s+)?(?:currency|ccy)(?=$|[\s:=])/i;
const nonExpenseStatus = /^(?:(?:full |partial )?refund(?:ed)?(?:\s+(?:successful|processed|completed|receipt))?|(?:payment|transaction)\s+(?:failed|cancelled|canceled|pending|declined)|(?:payment|transaction)\s+status\s*:\s*(?:failed|cancelled|canceled|pending|declined)|money received|payment received|(?:cash[ -]?in)\s+(?:successful|completed|receipt))\b/i;
const foreignMoney = /(?:[$€£¥₩฿₹₫₽]\s*\d|\d[\d,.]*\s*[$€£¥₩฿₹₫₽])/;
const currencyCodes = new Set(Intl.supportedValuesOf("currency"));
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const paymentPatterns = [
  ["CASH", /\b(?:cash(?:\s+on\s+delivery)?|cod)\b/i],
  ["DEBIT_CARD", /\bdebit\s+card\b/i],
  ["CREDIT_CARD", /\bcredit\s+card\b/i],
  ["BANK_TRANSFER", /\bbank\s+transfer\b/i],
  ["BANK_PAYMENT", /\bbank\s+payment\b/i],
  ["PAY_LATER", /^(?:s\s*pay\s*later|shopee\s+pay\s*later|pay\s*later|buy now,?\s+pay later|bnpl)$/i],
] as const satisfies readonly (readonly [PaymentMethod, RegExp])[];

function singleValue<Value extends string>(values: Iterable<Value>) {
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

function isExpenseText(value: string): boolean {
  return value.length <= 100 && /\p{L}.*\p{L}/u.test(value) &&
    !titleLabel.test(value) && !dateLabel.test(value) &&
    !timeLabel.test(value) && !orderTimestampLabel.test(value) && !fulfillmentLabel.test(value) &&
    !paymentLabel.test(value) && !bankLabel.test(value) &&
    !timeZoneLabel.test(value) && !totalLabel.test(value) && !currencyLabel.test(value) &&
    !/^(?:gcash|maya|(?:merchant|vendor|payee|biller|store)(?: name)?|paid to|receipt|invoice|transaction|info|details|n\/?a|(?:payment|transaction) successful)$/i.test(value) &&
    !/^(?:merchant|vendor|payee|biller|store|paid to|receipt|invoice|transaction|date|total|ref(?:erence)?)(?:\s*[:=]|\s+(?:name\b|no\.?|number|date|\d))/i.test(value);
}

function readMerchant(lines: string[]) {
  const labeled = getLabeledValues(lines, merchantLabel);
  if (labeled.length) return singleValue(labeled.filter(isExpenseText));

  // A printed receipt often has an unlabeled business name near the top.
  const heading = lines.slice(0, 4).find((line) => !/^(?:(?:official|sales|cash|vat|tax)\s+)*(?:receipt|invoice)\b/i.test(line));
  if (heading && isExpenseText(heading) && /\b(?:cafe|café|restaurant|mart|store|market|supermarket|pharmacy|bakery|shop|diner|grill|inc\.?|corp\.?)\b/i.test(heading)) {
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

function readShopItems(lines: string[]) {
  const shopIndex = lines.findIndex((line) => shopLink.test(line));
  if (shopIndex < 0) return {};
  const shop = lines[shopIndex].split(shopLink)[0]
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "").replace(/^preferred\s+/i, "").replace(/\s+chat$/i, "");
  const end = lines.findIndex((line, index) => index > shopIndex && /^(?:shop rating|merchandise subtotal)\b/i.test(line));
  const products = end < 0 ? [] : lines.slice(shopIndex + 1, end)
    .map((line) => line.replace(/\s*\(exp(?:iry)?\s*:[^)]*\)$/i, "").trim())
    .filter((line) => isExpenseText(line) && (line.match(/\b\p{L}{2,}\b/gu)?.length ?? 0) >= 3);
  return { merchant: isExpenseText(shop) ? shop : undefined, title: products.length === 1 ? products[0] : undefined };
}

function orderTotalValue(value: string) {
  const total = /^.*\byou['’]ve saved\b.*\bon this order\s+(.+)$/i.exec(value)?.[1] ?? value;
  return total.replace(/,\s+(?=\d{3}\b)/g, ",");
}

function readShopeeTotal(lines: string[], totalValues: string[]) {
  // OCR can confuse the peso sign with £. Verify the total against the peso checkout breakdown.
  const rows = shopeeCheckoutLabels.map((label) => lines.flatMap((line) => {
    const match = label.exec(line);
    return match ? [{ line, value: line.slice(match.index + match[0].length).trim().replace(/^-\s*/, "") }] : [];
  }));
  if (rows.some((matches) => matches.length !== 1)) return undefined;
  const [subtotal, shipping, discount, voucher] = rows.map(([row]) => row);
  if (![subtotal, shipping].every(({ value }) => /^(?:₱|P(?:HP)?)\s*\d/i.test(value))) return undefined;

  const normalizedLines = lines.map((line) => {
    if (line === discount.line || orderTotalLabel.test(line) || totalValues.includes(orderTotalValue(line))) {
      return line.replace(/£(?=\s*\d)/g, "₱");
    }
    return line;
  });
  if (hasForeignCurrency(normalizedLines)) return undefined;
  const amounts = [subtotal, shipping, discount, voucher].map(({ value }) => readAmount(value.replace(/^£/, "₱")));
  const total = singleValue(validValues(totalValues.map((value) => value.replace(/^£/, "₱")), readAmount));
  if (!total || !amounts.every((amount) => amount !== undefined)) return undefined;
  const [merchandiseAmount, shippingAmount, shippingDiscount, voucherAmount] = amounts.map(parsePesoAmount);
  if (parsePesoAmount(total) === merchandiseAmount + shippingAmount - shippingDiscount - voucherAmount) return total;
}

function suggestAmount(lines: string[], footer: string[]) {
  const primaryOrderTotals = getLabeledValues(lines, orderTotalLabel);
  const orderTotals = [...primaryOrderTotals, ...getLabeledValues(footer, orderTotalLabel)].map(orderTotalValue);
  if (orderTotals.length) {
    if (hasForeignCurrency(lines)) return readShopeeTotal(lines, orderTotals);
    return singleValue(validValues(orderTotals, readAmount));
  }
  if (!hasForeignCurrency(lines)) return singleValue(validValues(getLabeledValues(lines, totalLabel), readAmount));
}

function isoDate(year: string, month: string, day: string) {
  return parseExpenseDay(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
}

function readCalendarDate(calendar: string) {
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

function readTimestamp(value: string) {
  const [, printedDate = value, clock] = dateAndClock.exec(value) ?? [];
  const calendar = printedDate.trim();
  const date = readCalendarDate(calendar);
  return { date, clock: date || ambiguousNumericDate.test(calendar) ? clock : undefined };
}

function isManilaTimeZone(zone: string): boolean {
  return manilaTimeZone.test(zone.replace(/^\((.+)\)$|^\[(.+)\]$/, "$1$2"));
}

function readClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::([0-5]\d))?(?:\s*([ap])\.?\s*m\.?)?\s*(.*)$/i.exec(value);
  if (!match) return undefined;
  const [, rawHours, minutes, , period, zone] = match;
  if (zone && !isManilaTimeZone(zone)) return undefined;

  let hours = Number(rawHours);
  if (period) {
    if (hours < 1 || hours > 12) return undefined;
    hours = hours % 12 + (period.toLowerCase() === "p" ? 12 : 0);
  }

  const clock = `${String(hours).padStart(2, "0")}:${minutes}`;
  try {
    return parseExpenseTime(clock) === null ? undefined : clock;
  } catch {
    return undefined;
  }
}

function suggestTime(lines: string[], values: string[]) {
  const zones = getLabeledValues(lines, timeZoneLabel);
  if (zones.some((zone) => !isManilaTimeZone(zone))) return undefined;

  const times = validValues(values, readClock);
  if (times.length === values.length) return singleValue(times);
}

function suggestTimestamp(lines: string[]) {
  // Tracking timelines put the timestamp before the event, sometimes after OCR noise from an icon.
  const events = lines.flatMap((line) => {
    const row = timelineTimestamp.exec(line);
    return row ? [{ timestamp: row[1] + " " + row[2], event: row[3] }] : [];
  });
  const orderValues = [
    ...getLabeledValues(lines, orderTimestampLabel),
    ...events.filter(({ event }) => orderPlacedEvent.test(event)).map(({ timestamp }) => timestamp),
  ];
  const hasPlacedRow = lines.some((line) => {
    const prefix = /\d[\d./:\s]*\s+/.exec(line);
    return prefix && orderPlacedEvent.test(line.slice(prefix.index + prefix[0].length));
  });
  if (orderValues.length || hasPlacedRow) {
    const timestamps = orderValues.map(readTimestamp);
    const dates = timestamps.flatMap(({ date }) => date ? [date] : []);
    const date = singleValue(dates);
    if (dates.length && !date) return {};
    const clocks = orderValues.flatMap((value, index) => {
      const clock = timestamps[index].clock ?? (/^\d{1,2}:\d{2}\b/.test(value) ? value : undefined);
      return clock ? [clock] : [];
    });
    return { date, time: suggestTime(lines, clocks) };
  }

  const hasFulfillment = lines.some((line) => fulfillmentLabel.test(line)) ||
    events.some(({ event }) => fulfillmentLabel.test(event));
  let inFulfillmentSection = false;
  // Preserve indexes so a split label cannot pick up a value across a removed line.
  const transactionLines = hasFulfillment ? lines.map((line) => {
    const lifecycle = fulfillmentLabel.exec(line);
    if (lifecycle) {
      inFulfillmentSection = /^\s*[:=]?\s*$/.test(line.slice(lifecycle[0].length));
      return "";
    }
    if (inFulfillmentSection && (/^(?:date|time)\b/i.test(line) || readTimestamp(line).date || readClock(line))) return "";
    inFulfillmentSection = false;
    return line;
  }) : lines;
  const labeledDates = getLabeledValues(transactionLines, dateLabel);
  // Unlabeled timestamps near shipping or delivery events are ambiguous.
  const timestamps = (labeledDates.length ? labeledDates : hasFulfillment ? [] : lines).map(readTimestamp);
  const timeLines = hasFulfillment ? transactionLines.map((line) => /^time(?=$|\s*[:=]|\s+\d)/i.test(line) ? "" : line) : transactionLines;
  const date = singleValue(timestamps.flatMap(({ date }) => date ? [date] : []));
  const time = suggestTime(lines, [
    ...getLabeledValues(timeLines, timeLabel),
    ...timestamps.flatMap(({ clock }) => clock ? [clock] : []),
  ]);
  return { date, time };
}

function readPaymentMethod(value: string) {
  if (/\bor\b|\/|\b(?:credit\s+(?:and|&)\s+debit|debit\s+(?:and|&)\s+credit)\b/i.test(value)) return undefined;
  if (/^c\.o\.d\.?$/i.test(value)) return "CASH";
  const matches = paymentPatterns.filter(([, pattern]) => pattern.test(value));
  if (matches.length !== 1) return undefined;
  const [method] = matches[0];
  if (method === "CASH" && !/^(?:cash(?:\s+on\s+delivery)?|cod)$/i.test(value)) return undefined;
  return method;
}

function withoutMaskedCard(value: string) {
  return value.replace(/\s+(?:ending\s+in\s+\d{4}|[x*•]{2,}[-\s]*\d{4})\)?$/i, "");
}

function readBankName(value: string) {
  const name = value.replace(/^[\s:=(–—-]+|[\s)=–—-]+$/g, "");
  if (!isExpenseText(name) || !/^\p{L}[\p{L}\p{M} .&'’-]+$/u.test(name)) return undefined;
  if (/^(?:(?:visa|master\s*card|jcb|amex|american express|unionpay)(?:\s+(?:credit|debit))?(?:\s+card)?|bank|card|(?:credit|debit)(?:\s+card)?|none|unknown)$/i.test(name)) return undefined;
  return name;
}

function suggestPayment(lines: string[]) {
  const values = getLabeledValues(lines, paymentLabel).map(withoutMaskedCard);
  const methods = values.map(readPaymentMethod).filter((method) => method !== undefined);
  const paymentMethod = methods.length === values.length ? singleValue(methods) : undefined;
  if (paymentMethod === "CASH" || paymentMethod === "PAY_LATER") return { paymentMethod };

  const labeledBanks = getLabeledValues(lines, bankLabel).map(withoutMaskedCard);
  const methodPattern = paymentPatterns.find(([method]) => method === paymentMethod)?.[1];
  const inlineBanks = methodPattern ? values.flatMap((value) => {
    const match = methodPattern.exec(value);
    if (!match) return [];
    const before = value.slice(0, match.index).trim();
    const after = value.slice(match.index + match[0].length).trim();
    // A bank may precede the method or follow it, but two fragments are ambiguous.
    return before && after ? [] : [before || after];
  }) : [];
  const bankNames = validValues(labeledBanks.length ? labeledBanks : inlineBanks, readBankName);
  const bank = singleValue(bankNames.map((name) => name.toLowerCase())) ? bankNames[0] : undefined;
  return { paymentMethod, bank };
}

function validValues(values: string[], read: (value: string) => string | undefined) {
  return values.flatMap((value) => {
    const parsed = read(value);
    return parsed === undefined ? [] : [parsed];
  });
}

function receiptLines(text: string) {
  return text.normalize("NFKC").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function suggestReceiptFields(text: string, shopFooter = ""): ReceiptSuggestions {
  const lines = receiptLines(text);
  if (lines.some((line) => nonExpenseStatus.test(line))) return {};

  const footer = receiptLines(shopFooter);
  const shop = readShopItems(footer);
  const title = singleValue(getLabeledValues(lines, titleLabel).filter(isExpenseText)) ?? shop.title;
  const merchant = readMerchant(lines) ?? shop.merchant;
  const amount = suggestAmount(lines, footer);
  const { date, time } = suggestTimestamp(lines);
  const payment = suggestPayment(lines);
  const focusedPayment = payment.paymentMethod ? payment : suggestPayment(footer);
  const paymentMethod = payment.paymentMethod ?? focusedPayment.paymentMethod;
  const bank = paymentMethod === "CASH" || paymentMethod === "PAY_LATER" ? undefined : payment.bank ?? focusedPayment.bank;

  return {
    ...(title ? { title } : {}),
    ...(merchant ? { merchant } : {}),
    ...(amount ? { amount } : {}),
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(bank ? { bank } : {}),
  };
}
