import { createExpenseGroupAccess } from "@/app/(dashboard)/_lib/expense-groups/access";
import { getCurrentUser } from "@/app/lib/auth/session";
import { getManilaToday } from "@/app/lib/expenses/date";
import { prisma } from "@/server/db/client";
import { parseExpenseGroupQuery, type ExpenseGroupQuery } from "../_lib/navigation";
import { expenseCsvResponse } from "../_lib/expenses/export";
import { expensePdfResponse, expenseXlsxResponse } from "../_lib/expenses/export-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401, headers: { "Cache-Control": "no-store" } });
  const access = createExpenseGroupAccess(prisma, async () => user.id);
  const { id } = await params;
  const group = await access.resolveRoute(id);
  if (!group) return new Response("Expense group not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const searchParams = new URL(request.url).searchParams;
  const formats = searchParams.getAll("format");
  const format = formats[0] ?? "csv";
  if (formats.length > 1 || !["csv", "pdf", "xlsx"].includes(format)) {
    return new Response("Choose CSV, PDF, or Excel (.xlsx).", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const query: ExpenseGroupQuery = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  const { filters } = parseExpenseGroupQuery(query, getManilaToday());
  const source = await access.prepareExpenseExport(group.id, filters);
  if (!source) return new Response("Expense group not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (format === "pdf") return expensePdfResponse(source, request.signal);
  if (format === "xlsx") return expenseXlsxResponse(source, request.signal);
  return expenseCsvResponse(source, request.signal);
}
