import type { ParseResult, Parser } from "papaparse";
import { MAX_IMPORT_ROWS } from "@/app/lib/expenses/import";

export type ImportSheet = {
  name: string;
  rows: Array<{ rowNumber: number; cells: string[] }>;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function readDelimitedFile(file: File, tabSeparated: boolean): Promise<ImportSheet> {
  const [buffer, { default: Papa }] = await Promise.all([file.arrayBuffer(), import("papaparse")]);
  const bytes = new Uint8Array(buffer);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be"
      : "utf-8";
  let input: string;

  try {
    input = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Save the text file as UTF-8 CSV or TSV and try again.");
  }
  if (input.includes("\0")) throw new Error("Choose a valid CSV or TSV file.");

  return new Promise((resolve, reject) => {
    const rows: ImportSheet["rows"] = [];
    let rowNumber = 1;

    Papa.parse<string[]>(input, {
      delimiter: tabSeparated ? "\t" : undefined,
      delimitersToGuess: [",", ";", "\t"],
      worker: true,
      chunkSize: 128 * 1024,
      chunk(result: ParseResult<string[]>, parser: Parser) {
        if (result.errors.some(({ type }) => type === "Quotes")) {
          reject(new Error("The text file has unmatched or invalid quotes."));
          parser.abort();
          return;
        }

        for (const cells of result.data) {
          if (cells.some((cell) => cell.trim() !== "")) {
            rows.push({ rowNumber, cells });
            if (rows.length > MAX_IMPORT_ROWS + 1) {
              reject(new Error(`Choose a file with up to ${MAX_IMPORT_ROWS} expense rows.`));
              parser.abort();
              return;
            }
          }

          // Quoted fields can span several source lines before the next record.
          rowNumber += 1 + cells.reduce((lines, cell) => lines + (cell.match(/\r\n|\r|\n/g)?.length ?? 0), 0);
        }
      },
      complete() {
        resolve({ name: file.name, rows });
      },
    });
  });
}

async function readWorkbook(file: File): Promise<ImportSheet[]> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");

  try {
    const sheets = await readXlsxFile(file, {
      trim: false,
      // Keep Excel's numeric values as decimal strings for exact centavo validation.
      parseNumber: (value) => value,
    });

    return sheets.map(({ sheet, data }) => ({
      name: sheet,
      rows: data.flatMap((row, index) => {
        const cells = row.map((value) => value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value ?? ""));
        return cells.some((cell) => cell.trim() !== "") ? [{ rowNumber: index + 1, cells }] : [];
      }),
    }));
  } catch {
    throw new Error("This workbook could not be read. Choose a valid, unlocked .xlsx file.");
  }
}

export async function readExpenseImportFile(file: File): Promise<ImportSheet[]> {
  if (!file.size) throw new Error("The file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Choose a file up to 5 MB.");

  const extension = file.name.toLowerCase().split(".").pop();
  let sheets: ImportSheet[];

  switch (extension) {
    case "csv":
    case "tsv":
      sheets = [await readDelimitedFile(file, extension === "tsv")];
      break;
    case "xlsx":
      sheets = await readWorkbook(file);
      break;
    default:
      throw new Error("Choose a .csv, .tsv, or .xlsx file.");
  }

  if (!sheets.some(({ rows }) => rows.length > 0)) throw new Error("The file has no rows to import.");
  return sheets;
}
