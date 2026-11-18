import type { ExpenseExportRow } from "@/app/(dashboard)/_lib/expense-groups/access";
import { expenseTimeInput } from "@/app/lib/expenses/date";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";

const headers = ["Date", "Time (Asia/Manila)", "Title", "Merchant", "Amount (PHP)", "Category", "Payment method", "Bank", "Notes"];

function csvCell(value: string) {
  // Quoting alone does not prevent spreadsheet formulas. Guard text even when
  // whitespace or control characters precede the formula marker.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /^[\t\r\n]/u.test(value)
    ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function expenseCsvRow(expense: ExpenseExportRow) {
  const amount = `${Math.floor(expense.amountCentavos / 100)}.${String(expense.amountCentavos % 100).padStart(2, "0")}`;
  return [
    expense.date.toISOString().slice(0, 10), expenseTimeInput(expense.timeMinutes),
    expense.title, expense.merchant ?? "", amount, expense.categoryName,
    expense.paymentMethod ? paymentMethodLabels[expense.paymentMethod] : "",
    expense.bankName ?? "", expense.notes ?? "",
  ].map(csvCell).join(",") + "\r\n";
}

export function expenseCsvResponse(
  source: { publicId: string; batches(): AsyncGenerator<ExpenseExportRow[]> },
  signal?: AbortSignal,
) {
  const encoder = new TextEncoder();
  const batches = source.batches();
  let headerSent = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal?.throwIfAborted();
        if (!headerSent) {
          headerSent = true;
          controller.enqueue(encoder.encode("\uFEFF" + headers.map(csvCell).join(",") + "\r\n"));
          return;
        }
        const batch = await batches.next();
        signal?.throwIfAborted();
        if (batch.done) controller.close();
        else controller.enqueue(encoder.encode(batch.value.map(expenseCsvRow).join("")));
      } catch (error) {
        await batches.return(undefined);
        controller.error(error);
      }
    },
    async cancel() { await batches.return(undefined); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${source.publicId}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
