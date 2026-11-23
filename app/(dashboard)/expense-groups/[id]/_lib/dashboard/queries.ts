import "server-only";

import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createDashboardAccess } from "./access";

const access = createDashboardAccess(prisma, requireUserId);

export async function getDashboard(expenseGroupId: number, month: string, today: string) {
  return access.get(expenseGroupId, month, today);
}
