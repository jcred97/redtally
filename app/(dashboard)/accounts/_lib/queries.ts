import "server-only";

import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createFinancialAccountAccess } from "./access";

const access = createFinancialAccountAccess(prisma, requireUserId);

export const { list: getFinancialAccounts, listBanks: getFinancialAccountBanks } = access;
