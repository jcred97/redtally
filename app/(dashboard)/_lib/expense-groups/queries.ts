import "server-only";

import { prisma } from "@/server/db/client";
import { requireUserId } from "@/app/lib/auth/session";
import { createExpenseGroupAccess, type ExpenseHistoryFilters } from "./access";

const access = createExpenseGroupAccess(prisma, requireUserId);

export async function getExpenseGroups() {
  return access.list();
}

export async function getExpenseGroupOptions() {
  return access.listForSwitcher();
}

export async function getExpenseGroupById(id: number) {
  return access.getById(id);
}

export async function resolveExpenseGroupRoute(key: string) {
  return access.resolveRoute(key);
}

export async function getExpensePageByExpenseGroupId(
  id: number,
  page: number,
  filters?: ExpenseHistoryFilters,
  includeDayTotals = false,
) {
  return access.getExpensePageById(id, page, filters, includeDayTotals);
}

export type ExpenseHistoryEntry = NonNullable<Awaited<ReturnType<typeof getExpensePageByExpenseGroupId>>>["expenses"][number];

export async function getExpenseHistoryAvailability(id: number, filters: ExpenseHistoryFilters) {
  return access.getExpenseHistoryAvailability(id, filters);
}

export async function getExpenseHistoryProviderOptions(id: number) {
  return access.listExpenseHistoryProviderOptions(id);
}

export async function getExpenseHistoryMerchantLabel(id: number, merchant: string) {
  return access.getExpenseHistoryMerchantLabel(id, merchant);
}
