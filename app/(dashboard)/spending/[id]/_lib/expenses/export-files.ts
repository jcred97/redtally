import type { ExpenseExportRow } from "@/app/(dashboard)/_lib/expense-groups/access";
import { expenseTimeInput } from "@/app/lib/expenses/date";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";
import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { createPdfText } from "./pdf-text";
import { drawColorEmoji } from "./pdf-emoji";

pdfMake.addVirtualFileSystem(pdfFonts);

type ExpenseExportSource = {
  publicId: string;
  batches(): AsyncGenerator<ExpenseExportRow[]>;
};

async function collectExpenses(source: ExpenseExportSource, signal?: AbortSignal) {
  const expenses: ExpenseExportRow[] = [];
  signal?.throwIfAborted();
  for await (const batch of source.batches()) {
    signal?.throwIfAborted();
    expenses.push(...batch);
  }
  signal?.throwIfAborted();
  return expenses;
}

function amountText(centavos: number | bigint) {
  const amount = BigInt(centavos);
  return `${amount / BigInt(100)}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}

function paymentText(expense: ExpenseExportRow) {
  return expense.paymentMethod ? paymentMethodLabels[expense.paymentMethod] : "";
}

function fileResponse(bytes: Uint8Array<ArrayBuffer>, source: ExpenseExportSource, extension: string, contentType: string) {
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="expenses-${source.publicId}.${extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function expenseXlsxResponse(source: ExpenseExportSource, signal?: AbortSignal) {
  const expenses = await collectExpenses(source, signal);
  const headers = ["Date", "Time (Asia/Manila)", "Title", "Merchant", "Amount (PHP)", "Category", "Payment method", "Bank", "Notes"];
  const data: SheetData = [headers.map((value) => ({ value, type: String, fontWeight: "bold" }))];
  for (const expense of expenses) {
    const values = [
      expense.date.toISOString().slice(0, 10), expenseTimeInput(expense.timeMinutes),
      expense.title, expense.merchant ?? "", expense.amountCentavos / 100,
      expense.categoryName, paymentText(expense), expense.bankName ?? "", expense.notes ?? "",
    ];
    // Explicit String cells preserve user text without treating formula markers as formulas.
    data.push(values.map((value) => typeof value === "number"
      ? { value, type: Number, format: "#,##0.00" }
      : { value, type: String, wrap: true }));
  }
  const buffer = await writeXlsxFile(data, {
    sheet: "Expenses", stickyRowsCount: 1,
    columns: [14, 22, 30, 25, 18, 22, 22, 25, 50].map((width) => ({ width })),
  }).toBuffer();
  signal?.throwIfAborted();
  return fileResponse(new Uint8Array(buffer), source, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export async function expensePdfResponse(source: ExpenseExportSource, signal?: AbortSignal) {
  const expenses = await collectExpenses(source, signal);
  const pdfText = createPdfText();
  const total = expenses.reduce((sum, expense) => sum + BigInt(expense.amountCentavos), BigInt(0));
  const content: Content[] = [
    { text: "Expenses", fontSize: 22, bold: true, margin: [0, 0, 0, 8] },
    { text: `Expense count: ${expenses.length}`, margin: [0, 0, 0, 4] },
    { text: `Total: PHP ${amountText(total)}`, bold: true, margin: [0, 0, 0, 6] },
    { text: "Includes all expenses matching the selected history filters. Times are in Asia/Manila.", color: "#555555", margin: [0, 0, 0, 18] },
  ];
  if (expenses.length === 0) content.push({ text: "No expenses match the selected filters." });
  for (const expense of expenses) {
    const heading = `${expense.title} - PHP ${amountText(expense.amountCentavos)}`;
    // pdfmake clips unbreakable blocks taller than a page. Allow unusually long
    // legacy titles and titles with many explicit line breaks to flow normally.
    const keepHeadingWithDate = heading.length <= 160 && heading.split(/[\r\n\u2028\u2029]/u).length <= 24;
    content.push({
      // Move only the heading and the opening details together; the rest of the
      // expense, including notes longer than a page, can break naturally.
      unbreakable: keepHeadingWithDate,
      stack: [
        { text: pdfText.text(heading), bold: true, fontSize: 12, margin: [0, 12, 0, 5] },
        {
          text: [
            `Date: ${expense.date.toISOString().slice(0, 10)}`,
            ...(expense.timeMinutes === null ? [] : [`Time (Asia/Manila): ${expenseTimeInput(expense.timeMinutes)}`]),
          ].join("\n"),
          lineHeight: 1.25,
        },
      ],
    });
    content.push({
      text: pdfText.text([
        `Category: ${expense.categoryName}`,
        `Merchant: ${expense.merchant ?? "-"}`,
        `Payment method: ${paymentText(expense) || "-"}`,
        `Bank: ${expense.bankName ?? "-"}`,
        `Notes: ${expense.notes ?? "-"}`,
      ].join("\n")),
      lineHeight: 1.25,
    });
  }
  const definition: TDocumentDefinitions = {
    info: { title: "Expenses", author: "Redtally" },
    pageSize: "A4", pageMargins: [40, 40, 40, 45],
    defaultStyle: { font: "Roboto", fontSize: 10 },
    content,
    footer: (page, pages) => ({
      stack: [
        { text: `${page} / ${pages}`, fontSize: 9 },
        ...(pdfText.usesOpenMoji() ? [{
          text: [
            { text: "Emoji: OpenMoji", link: "https://openmoji.org/" },
            " (",
            { text: "CC BY-SA 4.0", link: "https://creativecommons.org/licenses/by-sa/4.0/" },
            ")",
          ],
          fontSize: 7, color: "#666666", margin: [0, 3, 0, 0] as [number, number, number, number],
        }] : []),
      ],
      alignment: "center", margin: [0, 12, 0, 0],
    }),
  };
  await pdfText.loadFonts();
  signal?.throwIfAborted();
  const pdf = pdfMake.createPdf(definition, { bufferPages: pdfText.hasColorEmoji() });
  if (pdfText.hasColorEmoji()) await drawColorEmoji(pdf, signal);
  const buffer = await pdf.getBuffer();
  signal?.throwIfAborted();
  return fileResponse(new Uint8Array(buffer), source, "pdf", "application/pdf");
}
