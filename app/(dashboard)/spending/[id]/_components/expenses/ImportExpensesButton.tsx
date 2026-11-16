"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import {
  previewExpenseImport,
  saveExpenseImport,
} from "@/app/(dashboard)/_lib/expense-imports/mutations";
import {
  expenseImportKey,
  MAX_IMPORT_ROWS,
  normalizeExpenseImportRow,
  type ExpenseImportRow,
} from "@/app/lib/expenses/import";
import { formatPesoAmount, parsePesoAmount } from "@/app/lib/expenses/money";
import type { ImportSheet } from "../../_lib/import-files";

const fields = [
  { key: "date", label: "Date", aliases: ["date", "expense date", "transaction date", "posting date"] },
  { key: "title", label: "Description", aliases: ["description", "title", "notes", "merchant", "particulars"] },
  { key: "amount", label: "Amount (PHP)", aliases: ["amount", "expense amount", "amount php", "debit"] },
] as const;

type ColumnMapping = Record<(typeof fields)[number]["key"], string>;
type DateOrder = "" | "mdy" | "dmy";

type PreviewRow = {
  rowNumber: number;
  values: { date: string; title: string; amount: string };
} & (
  | { expense: ExpenseImportRow; key: string; centavos: number }
  | { error: string }
);

type Preview = {
  rows: PreviewRow[];
  existingMatches: Set<number>;
  fileMatches: Set<number>;
};

const emptyMapping: ColumnMapping = { date: "", title: "", amount: "" };
const selectClass =
  "mt-1.5 w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-red-400 disabled:opacity-60";

function guessColumns(headers: string[]): ColumnMapping {
  const names = headers.map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  const mapping = { ...emptyMapping };
  for (const { key, aliases } of fields) {
    for (const alias of aliases) {
      const index = names.indexOf(alias);
      if (index !== -1) {
        mapping[key] = String(index);
        break;
      }
    }
  }
  return mapping;
}

function readPreviewRows(sheet: ImportSheet, columns: ColumnMapping, dateOrder: DateOrder): PreviewRow[] {
  return sheet.rows.slice(1).map(({ rowNumber, cells }) => {
    const values = {
      date: cells[Number(columns.date)] ?? "",
      title: cells[Number(columns.title)] ?? "",
      amount: cells[Number(columns.amount)] ?? "",
    };
    try {
      const expense = normalizeExpenseImportRow(rowNumber, values, crypto.randomUUID(), dateOrder || undefined);
      const centavos = parsePesoAmount(expense.amount);
      return { rowNumber, values, expense, centavos, key: expenseImportKey(expense.title, expense.date, centavos) };
    } catch (error) {
      return { rowNumber, values, error: error instanceof Error ? error.message : "Invalid expense." };
    }
  });
}

function displayCell(value: string): string {
  return value.length > 100 ? value.slice(0, 100) + "…" : value.trim() || "—";
}

export default function ImportExpensesButton({
  expenseGroupId,
  categories,
}: {
  expenseGroupId: number;
  categories: { id: number; name: string }[];
}) {
  const fieldId = useId();
  const fileRequest = useRef(0);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [columns, setColumns] = useState(emptyMapping);
  const [dateOrder, setDateOrder] = useState<DateOrder>("");
  const [categoryId, setCategoryId] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [imported, setImported] = useState(0);

  const sheet = sheets[sheetIndex];
  const headers = sheet?.rows[0]?.cells ?? [];
  const rowCount = Math.max(0, (sheet?.rows.length ?? 0) - 1);
  const mappedColumns = fields.map(({ key }) => columns[key]);
  const hasMapping = mappedColumns.every((column) => column !== "");
  const distinctColumns = new Set(mappedColumns).size === fields.length;
  const categoryExists = categories.some(({ id }) => String(id) === categoryId);
  const canPreview = !reading && rowCount > 0 && rowCount <= MAX_IMPORT_ROWS && hasMapping && distinctColumns;

  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);

  function clearPreview() {
    setPreview(null);
    setSelected(new Set());
    setError("");
  }

  function reset() {
    fileRequest.current += 1;
    setSheets([]);
    setSheetIndex(0);
    setColumns(emptyMapping);
    setDateOrder("");
    setCategoryId(categories.length === 1 ? String(categories[0].id) : "");
    setReading(false);
    setImported(0);
    clearPreview();
  }

  function changeSheet(index: number, availableSheets = sheets) {
    setSheetIndex(index);
    setColumns(guessColumns(availableSheets[index]?.rows[0]?.cells ?? []));
    clearPreview();
  }

  async function changeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    reset();
    if (!file) return;
    const request = fileRequest.current;
    setReading(true);
    try {
      const { readExpenseImportFile } = await import("../../_lib/import-files");
      const availableSheets = await readExpenseImportFile(file);
      if (request !== fileRequest.current) return;
      if (availableSheets.length === 0) {
        setError("The file contains no sheets to import.");
        return;
      }
      setSheets(availableSheets);
      changeSheet(0, availableSheets);
    } catch (cause) {
      if (request === fileRequest.current) {
        setError(cause instanceof Error ? cause.message : "Unable to read this file.");
      }
    } finally {
      if (request === fileRequest.current) setReading(false);
    }
  }

  async function submit() {
    setError("");
    if (preview) {
      if (!categoryExists || selected.size === 0) return null;
      const expenses = preview.rows.flatMap((row) => "expense" in row && selected.has(row.rowNumber) ? [row.expense] : []);
      try {
        const result = await saveExpenseImport(expenseGroupId, Number(categoryId), expenses);
        if ("error" in result) {
          setError(result.error);
          return null;
        }
        setImported(result.count);
        return { success: true as const };
      } catch {
        setError("Unable to confirm that the expenses were saved. Retry to check and finish this import.");
        return null;
      }
    }

    if (!canPreview || !sheet) return null;
    const rows = readPreviewRows(sheet, columns, dateOrder);
    const valid = rows.filter((row) => "expense" in row);
    let existingMatches = new Set<number>();
    if (valid.length > 0) {
      try {
        const result = await previewExpenseImport(expenseGroupId, valid.map(({ expense }) => expense));
        if ("error" in result) {
          setError(result.error);
          return null;
        }
        existingMatches = new Set(result.duplicates);
      } catch {
        setError("Unable to check for duplicates. Try previewing again.");
        return null;
      }
    }

    const keyCounts = new Map<string, number>();
    for (const { key } of valid) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const fileMatches = new Set<number>();
    const selectedRows = new Set<number>();
    const seenKeys = new Set<string>();
    for (const { rowNumber, key } of valid) {
      if ((keyCounts.get(key) ?? 0) > 1) fileMatches.add(rowNumber);
      if (!existingMatches.has(rowNumber) && !seenKeys.has(key)) selectedRows.add(rowNumber);
      seenKeys.add(key);
    }
    setSelected(selectedRows);
    setPreview({ rows, existingMatches, fileMatches });
    return null;
  }

  function selectRow(rowNumber: number, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
  }

  return (
    <div>
      <FormDialog
        triggerLabel="Import expenses"
        triggerVariant="secondary"
        title="Import expenses"
        description="Choose a file with column headers, then preview the expenses before saving."
        dialogSize="wide"
        onOpenAction={reset}
        disabled={categories.length === 0}
        submitDisabled={preview ? !categoryExists || selected.size === 0 : !canPreview}
        submitLabel={preview ? `Import ${selected.size} ${selected.size === 1 ? "expense" : "expenses"}` : "Preview expenses"}
        pendingLabel={preview ? "Importing…" : "Checking duplicates…"}
        failureMessage="Unable to complete the import. Please try again."
        submitAction={submit}
      >
        <div>
          <label htmlFor={`${fieldId}-file`} className="block text-sm text-gray-300">Expense file</label>
          <input
            id={`${fieldId}-file`}
            type="file"
            accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby={`${fieldId}-file-hint`}
            onChange={changeFile}
            className="mt-1.5 w-full min-w-0 cursor-pointer text-sm text-gray-300 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-gray-700 file:bg-gray-800 file:px-3 file:py-2 file:text-white hover:file:bg-gray-700"
          />
          <p id={`${fieldId}-file-hint`} className="mt-2 text-xs text-gray-400">
            CSV, TSV, or Excel (.xlsx). Up to {MAX_IMPORT_ROWS} data rows per import. The original file stays on this device.
          </p>
          {reading && <p className="mt-2 text-sm text-gray-300" role="status">Reading file…</p>}
        </div>

        {sheets.length > 1 && (
          <label className="block text-sm text-gray-300">
            Worksheet
            <select value={sheetIndex} onChange={(event) => changeSheet(Number(event.target.value))} className={selectClass}>
              {sheets.map(({ name }, index) => <option key={index} value={index}>{name}</option>)}
            </select>
          </label>
        )}

        {sheet && (rowCount === 0 || rowCount > MAX_IMPORT_ROWS) && (
          <p role="alert" className="text-sm text-red-400">
            {rowCount === 0
              ? "Choose a file or worksheet with a header row and at least one expense row."
              : `This sheet has more than ${MAX_IMPORT_ROWS} expense rows. Split it into smaller files.`}
          </p>
        )}

        {sheet && rowCount > 0 && rowCount <= MAX_IMPORT_ROWS && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {fields.map(({ key, label }) => (
                <label key={key} className="block min-w-0 text-sm text-gray-300">
                  {label} column
                  <select
                    value={columns[key]}
                    onChange={(event) => {
                      setColumns({ ...columns, [key]: event.target.value });
                      clearPreview();
                    }}
                    className={selectClass}
                  >
                    <option value="">Choose a column</option>
                    {headers.map((heading, index) => (
                      <option key={index} value={index}>
                        {heading.trim() ? `${displayCell(heading)} (column ${index + 1})` : `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {hasMapping && !distinctColumns && (
              <p role="alert" className="text-sm text-red-400">Choose a different column for each expense field.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-sm text-gray-300">
                Date format
                <select
                  value={dateOrder}
                  onChange={(event) => {
                    setDateOrder(event.target.value as DateOrder);
                    clearPreview();
                  }}
                  className={selectClass}
                >
                  <option value="">Automatic (flag ambiguous dates)</option>
                  <option value="mdy">Month / day / year</option>
                  <option value="dmy">Day / month / year</option>
                </select>
              </label>
              <label className="block min-w-0 text-sm text-gray-300">
                Category for selected expenses
                <select
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    setError("");
                  }}
                  className={selectClass}
                >
                  <option value="">Choose a category</option>
                  {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
          </>
        )}

        {preview && (
          <section aria-labelledby={`${fieldId}-preview`}>
            <h3 ref={previewHeading} id={`${fieldId}-preview`} tabIndex={-1} className="text-sm font-semibold">Expense preview</h3>
            <p className="mt-1 text-sm text-gray-400" role="status">
              {selected.size} of {preview.rows.length} rows selected.
              {(preview.existingMatches.size > 0 || preview.fileMatches.size > 0) &&
                " Check the duplicate warnings before choosing which rows to import."}
            </p>
            <div
              role="region"
              aria-labelledby={`${fieldId}-preview`}
              tabIndex={0}
              className="mt-2 max-h-80 overflow-auto rounded-lg border border-gray-700 focus-visible:outline-2 focus-visible:outline-red-400"
            >
              <table className="w-full min-w-[28rem] table-fixed text-left text-sm">
                <thead className="sticky top-0 bg-gray-800 text-xs text-gray-300">
                  <tr>
                    <th scope="col" className="w-10 px-2 py-2">Add</th>
                    <th scope="col" className="w-10 px-2 py-2">Row</th>
                    <th scope="col" className="px-2 py-2">Description</th>
                    <th scope="col" className="w-24 px-2 py-2">Date</th>
                    <th scope="col" className="w-28 px-2 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`Import row ${row.rowNumber}`}
                          disabled={"error" in row}
                          checked={selected.has(row.rowNumber)}
                          onChange={(event) => selectRow(row.rowNumber, event.target.checked)}
                          className="size-4 accent-red-500"
                        />
                      </td>
                      <td className="p-2 text-gray-400">{row.rowNumber}</td>
                      <td className="space-y-1 wrap-break-word p-2">
                        <p>{"expense" in row ? row.expense.title : displayCell(row.values.title)}</p>
                        {"error" in row && <p className="text-xs text-red-400">{row.error}</p>}
                        {preview.existingMatches.has(row.rowNumber) && <p className="text-xs text-amber-300">Possible duplicate in this group</p>}
                        {preview.fileMatches.has(row.rowNumber) && <p className="text-xs text-amber-300">Similar row in this file</p>}
                      </td>
                      <td className="break-words p-2">{"expense" in row ? row.expense.date : displayCell(row.values.date)}</td>
                      <td className="break-words p-2 text-right tabular-nums">
                        {"expense" in row ? formatPesoAmount(row.centavos) : displayCell(row.values.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      </FormDialog>
      <p role="status" className={imported ? "mt-1 text-xs text-gray-300" : "sr-only"}>
        {imported > 0 && `${imported} ${imported === 1 ? "expense" : "expenses"} imported.`}
      </p>
    </div>
  );
}
