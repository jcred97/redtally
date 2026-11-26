import "server-only";

import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createBillingAccess } from "./access";

const access = createBillingAccess(prisma, requireUserId);

export async function getBilling(expenseGroupId: number) {
  return access.get(expenseGroupId);
}
