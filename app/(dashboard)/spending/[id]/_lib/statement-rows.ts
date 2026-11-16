import { MAX_IMPORT_ROWS } from "@/app/lib/expenses/import";
import type { ImportSheet } from "./import-files";
import type { PdfTextPage } from "./pdf-text";

type TextItem = PdfTextPage["items"][number];
type TextLine = { y: number; items: TextItem[] };
type Heading = { name: string; x: number; end: number };
type Layout = { date: number; description: number; debit: number; credits: number[]; rightEdges: number[] };

const dateHeadings = new Set(["date", "transaction date", "trans date", "txn date", "posting date", "post date", "value date"]);
const descriptionHeadings = new Set(["description", "transaction description", "particulars", "details", "transaction details", "merchant", "merchant name"]);
const debitHeadings = new Set(["debit", "debits", "debit amount", "withdrawal", "withdrawals", "withdrawal amount", "purchase", "purchases", "purchase amount"]);
const creditHeadings = new Set(["credit", "credits", "credit amount", "deposit", "deposits", "deposit amount"]);
const otherHeadings = new Set(["balance", "running balance", "available balance", "reference", "reference no", "reference number", "check number", "cheque number", "amount", "currency", "type"]);
const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const month = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const dayFirst = new RegExp(`^(\\d{1,2})[ -](${month})[ ,-]+(\\d{4})$`, "i");
const monthFirst = new RegExp(`^(${month})[ -](\\d{1,2})[ ,-]+(\\d{4})$`, "i");
const currencyCodes = new Set(Intl.supportedValuesOf("currency").map((code) => code.toLowerCase()));
const summary = /^(?:subtotals?|(?:grand )?totals?(?: (?:debits?|credits?|withdrawals?|purchases?|deposits?))?|(?:opening|closing|beginning|ending|previous|new|available|current|running) balance|balance (?:brought|carried) forward|balance forward)$/i;
const moneyPiece = /^(?:(?:[₱$€£¥]|PHP)\s*)?[-+−(]?\s*\d[\d,.]*\s*(?:\)|CR|DR)?$/i;

function groupLines(items: TextItem[]): TextLine[] {
  const ordered = items.filter(({ text }) => text.trim()).sort((left, right) => left.y - right.y || left.x - right.x);
  const lines: TextLine[] = [];
  for (const item of ordered) {
    const last = lines.at(-1);
    // Text in one printed row may have different baselines (for example a peso symbol).
    const tolerance = Math.min(4, Math.max(1.5, item.height * 0.3));
    if (last && item.y - last.y <= tolerance) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((left, right) => left.x - right.x);
  return lines;
}

function headingText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9₱$€£¥]+/g, " ").trim();
}

function readHeading(text: string) {
  const normalized = headingText(text);
  const words = normalized.split(" ");
  const qualifier = words.at(-1) ?? "";
  const qualified = currencyCodes.has(qualifier) || /^[₱$€£¥]$/.test(qualifier);
  const name = qualified ? words.slice(0, -1).join(" ") : normalized;
  const recognized = dateHeadings.has(name) || descriptionHeadings.has(name) || debitHeadings.has(name) || creditHeadings.has(name) || otherHeadings.has(name);
  return recognized ? { name, foreignCurrency: qualified && qualifier !== "php" && qualifier !== "₱" } : undefined;
}

function readLayout(items: TextItem[]): Layout | undefined {
  const headings: Heading[] = [];
  let foreignDebit = false;
  for (let index = 0; index < items.length;) {
    const first = items[index];
    let last = index;
    let recognized = readHeading(first.text);
    let text = first.text;
    // PDF text extraction can split a heading across several positioned pieces.
    for (let next = index + 1; next < Math.min(index + 4, items.length); next++) {
      const previous = items[next - 1];
      if (items[next].x - previous.x - previous.width > 12) break;
      text += ` ${items[next].text}`;
      const candidate = readHeading(text);
      if (candidate) {
        recognized = candidate;
        last = next;
      }
    }
    const name = recognized?.name ?? headingText(first.text);
    if (debitHeadings.has(name) && recognized?.foreignCurrency) foreignDebit = true;
    headings.push({ name, x: first.x, end: items[last].x + items[last].width });
    index = last + 1;
  }

  const date = headings.findIndex(({ name }) => dateHeadings.has(name));
  const description = headings.findIndex(({ name }) => descriptionHeadings.has(name));
  const debit = headings.findIndex(({ name }) => debitHeadings.has(name));
  if (date < 0 || description <= date || debit <= description) return undefined;
  if (foreignDebit) throw new Error("This statement has a debit column in a currency other than PHP.");
  if (headings.filter(({ name }) => debitHeadings.has(name)).length !== 1) return undefined;
  const credits = headings.flatMap(({ name }, index) => creditHeadings.has(name) ? [index] : []);
  const rightEdges = headings.slice(1).map((heading, index) => (headings[index].end + heading.x) / 2);
  if (rightEdges.some((edge, index) => index > 0 && edge <= rightEdges[index - 1])) return undefined;
  return { date, description, debit, credits, rightEdges };
}

function readDate(text: string): string | undefined {
  const date = text.trim().replace(/\s*([/-])\s*/g, "$1").replace(/\s+/g, " ");
  const yearFirst = /^(\d{4})([/-])(\d{1,2})\2(\d{1,2})$/.exec(date);
  if (yearFirst) return `${yearFirst[1]}-${yearFirst[3].padStart(2, "0")}-${yearFirst[4].padStart(2, "0")}`;
  if (/^\d{1,2}([/-])\d{1,2}\1(?:\d{2}|\d{4})$/.test(date)) return date;
  const dayThenMonth = dayFirst.exec(date);
  const monthThenDay = monthFirst.exec(date);
  if (!dayThenMonth && !monthThenDay) return undefined;
  const day = dayThenMonth?.[1] ?? monthThenDay![2];
  const name = dayThenMonth?.[2] ?? monthThenDay![1];
  const year = dayThenMonth?.[3] ?? monthThenDay![3];
  const number = monthNames.indexOf(name.slice(0, 3).toLowerCase()) + 1;
  return `${year}-${String(number).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function joinPieces(items: TextItem[]): string {
  let text = "";
  for (const [index, item] of items.entries()) {
    const previous = items[index - 1];
    const gap = previous ? item.x - previous.x - previous.width : 0;
    if (previous && gap > Math.max(1, item.height * 0.13) && !/\s$/.test(text) && !/^\s/.test(item.text)) text += " ";
    text += item.text;
  }
  return text.trim();
}

function hasAmount(text: string): boolean {
  return text !== "" && !/^(?:[-‐‑‒–—−]+|(?:₱|PHP)?\s*0+(?:\.0+)?)$/i.test(text);
}

function readCells(items: TextItem[], layout: Layout): string[] {
  const cells: TextItem[][] = Array.from({ length: layout.rightEdges.length + 1 }, () => []);
  for (const item of items) {
    // A long right-aligned amount can start in the preceding column.
    const position = moneyPiece.test(item.text.trim()) ? item.x + item.width : item.x;
    const column = layout.rightEdges.findIndex((edge) => position < edge);
    cells[column === -1 ? cells.length - 1 : column].push(item);
  }
  return cells.map(joinPieces);
}

export function parseStatementRows(pages: PdfTextPage[]): ImportSheet["rows"] {
  const rows: ImportSheet["rows"] = [{ rowNumber: 1, cells: ["Date", "Description", "Debit"] }];
  let foundText = false;
  let foundLayout = false;
  let lastLayout: Layout | undefined;
  for (const { pageNumber, items } of pages) {
    const lines = groupLines(items);
    foundText ||= lines.length > 0;
    let layout: Layout | undefined;
    let beforeLayoutHadTransactions = false;
    let previous: { row: ImportSheet["rows"][number]; line: TextLine } | undefined;

    for (const line of lines) {
      const printedCurrency = /^(?:account |statement )?currency:?\s+([a-z]{3})\s*$/i.exec(joinPieces(line.items))?.[1].toLowerCase();
      if (printedCurrency && printedCurrency !== "php" && currencyCodes.has(printedCurrency)) {
        throw new Error("This statement is in a currency other than PHP.");
      }
      const nextLayout = readLayout(line.items);
      if (nextLayout) {
        if (beforeLayoutHadTransactions) throw new Error(`Some transactions on page ${pageNumber} are above the supported column headings.`);
        layout = nextLayout;
        lastLayout = layout;
        foundLayout = true;
        previous = undefined;
        continue;
      }
      if (!layout) {
        const possibleDate = lastLayout ? readCells(line.items, lastLayout)[lastLayout.date] : "";
        beforeLayoutHadTransactions ||= line.items.length >= 3 &&
          (readDate(possibleDate) !== undefined || line.items.slice(0, 3).some(({ text }) => readDate(text) !== undefined)) &&
          line.items.some(({ text }) => moneyPiece.test(text.trim()));
        continue;
      }

      const cells = readCells(line.items, layout);
      const dateText = cells[layout.date];
      const date = readDate(dateText);
      const description = cells[layout.description];
      const debit = cells[layout.debit];

      if (date && hasAmount(debit) && !summary.test(description)) {
        if (layout.credits.some((column) => hasAmount(cells[column]))) {
          throw new Error(`A transaction on page ${pageNumber} has both debit and credit amounts. Use the bank's CSV or Excel export.`);
        }
        if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Choose a statement with up to ${MAX_IMPORT_ROWS} debit rows.`);
        const row = { rowNumber: rows.length + 1, cells: [date, description, debit], sourcePage: pageNumber };
        rows.push(row);
        previous = { row, line };
      } else if (previous && description && !summary.test(description) &&
          cells.filter(Boolean).length === 1 &&
          line.y - previous.line.y <= Math.max(4, previous.line.items[0].height * 1.65)) {
        previous.row.cells[1] += ` ${description}`;
        previous.line = line;
      } else {
        if (!date && hasAmount(debit) && description && !summary.test(description)) {
          throw new Error(`A transaction date on page ${pageNumber} could not be read. Use the bank's CSV or Excel export.`);
        }
        previous = undefined;
      }
    }

    if (!layout && beforeLayoutHadTransactions) throw new Error(`The transaction table on page ${pageNumber} has an unsupported layout. Use the bank's CSV or Excel export.`);
  }

  if (!foundText) throw new Error("This PDF has no selectable text. Choose a statement with selectable text or use CSV or Excel.");
  if (!foundLayout) throw new Error("This statement layout is unsupported. Choose a statement with Date, Description, and a separate Debit, Withdrawal, or Purchase column.");
  if (rows.length === 1) throw new Error("No debit rows were found in this statement.");
  return rows;
}
