"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createDashboardAccess } from "./access";

const access = createDashboardAccess(prisma, requireUserId);

export async function saveMonthlyBudget(expenseGroupId: number, month: string, formData: FormData) {
  return changeBudget(() => access.saveBudget(expenseGroupId, month, formData.get("amount")));
}

export async function removeMonthlyBudget(expenseGroupId: number, month: string) {
  return changeBudget(() => access.removeBudget(expenseGroupId, month));
}

async function changeBudget(change: () => Promise<void>): Promise<{ success: true } | { error: string }> {
  try {
    await change();
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }

  revalidatePath("/expense-groups/[id]/[[...tab]]", "page");
  revalidatePath("/");
  return { success: true };
}
