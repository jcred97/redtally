import { runRecurringExpenses } from "@/app/(dashboard)/_lib/recurring-expenses/worker";
import { getManilaToday, parseExpenseDate } from "@/app/lib/expenses/date";
import { prisma } from "@/server/db/client";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const day = getManilaToday();
  const result = await runRecurringExpenses(prisma, parseExpenseDate(day));
  console.info("Recurring expense run", { date: day, ...result });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
