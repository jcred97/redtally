import "server-only";

import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createRecurringExpenseAccess } from "./access";

const access = createRecurringExpenseAccess(prisma, requireUserId);

export async function getRecurringExpenses(expenseGroupId: number) {
  return access.list(expenseGroupId);
}
