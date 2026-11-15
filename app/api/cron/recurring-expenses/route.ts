import { drainRecurringExpenses } from "@/app/(dashboard)/_lib/recurring-expenses/worker";
import { getManilaToday, parseExpenseDate } from "@/app/lib/expenses/date";
import { prisma } from "@/server/db/client";

export const maxDuration = 60;

// Leave room for the last transaction and backlog query before the host's cutoff.
const WORK_BUDGET_MS = 45_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const deadline = performance.now() + WORK_BUDGET_MS;
  const day = getManilaToday();
  const result = await drainRecurringExpenses(prisma, parseExpenseDate(day), () => performance.now() < deadline);
  const summary = { date: day, ...result };
  if (result.hasCatchUpRemaining) {
    console.warn("Recurring expense catch-up remains", summary);
  } else {
    console.info("Recurring expense run", summary);
  }
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
