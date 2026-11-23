"use client";

import { useState } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import Radio from "@/app/components/forms/Radio";

const formats = [
  { value: "csv", label: "CSV (.csv)", description: "A simple file for spreadsheets and importing into other apps." },
  { value: "pdf", label: "PDF (.pdf)", description: "A readable report for sharing, printing, or keeping records." },
  { value: "xlsx", label: "Excel (.xlsx)", description: "A formatted spreadsheet for sorting, filtering, and analysis." },
] as const;

export default function ExportExpensesButton({ exportHref }: { exportHref: string }) {
  const [format, setFormat] = useState<(typeof formats)[number]["value"]>("csv");

  async function downloadExpenses() {
    const url = new URL(exportHref, window.location.origin);
    url.searchParams.set("format", format);
    const response = await fetch(url);
    if (!response.ok) {
      return { error: response.status === 401
        ? "Your session has expired. Sign in again to export expenses."
        : "Unable to export expenses. Please try again." };
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
      ?? `expenses.${format}`;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      // Give the browser time to start consuming the file before releasing it.
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    }
    return { success: true as const };
  }

  return (
    <FormDialog
      triggerLabel="Export Expenses"
      triggerVariant="secondary"
      title="Export Expenses"
      description="Export all expenses matching your current filters, including every page. Choose All months in the expense list to export the full group."
      onOpenAction={() => setFormat("csv")}
      submitLabel="Download"
      pendingLabel="Preparing download..."
      failureMessage="Unable to export expenses. Please check your connection and try again."
      submitAction={downloadExpenses}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-gray-200">File type</legend>
        {formats.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${format === option.value ? "border-red-400 bg-red-500/10" : "border-gray-700 hover:border-gray-500"}`}
          >
            <Radio
              name="format"
              value={option.value}
              checked={format === option.value}
              onChange={() => setFormat(option.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-white">{option.label}</span>
              <span className="mt-1 block text-sm text-gray-400">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </FormDialog>
  );
}
