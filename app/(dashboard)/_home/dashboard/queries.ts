import "server-only";

import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createHomeDashboardAccess } from "./access";

const access = createHomeDashboardAccess(prisma, requireUserId);

export async function getHomeDashboard(groupPublicIds: string[], month: string, today: string) {
  return access.get(groupPublicIds, month, today);
}
