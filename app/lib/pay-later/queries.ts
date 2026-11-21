import "server-only";

import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createPayLaterAccess } from "./access";

const access = createPayLaterAccess(prisma);

export async function getExpenseGroupPayLater(expenseGroupId: number) {
  return access.getExpenseGroupPayLater(await requireUserId(), expenseGroupId);
}
