"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createRecurringExpenseAccess, type RecurringExpenseCommand } from "./access";

const access = createRecurringExpenseAccess(prisma, requireUserId);

export async function changeRecurringExpense(
  expenseGroupId: number,
  id: number | null,
  command: RecurringExpenseCommand,
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  try {
    await access.change(expenseGroupId, id, command, formData);
    revalidatePath(`/spending/${expenseGroupId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }
}
