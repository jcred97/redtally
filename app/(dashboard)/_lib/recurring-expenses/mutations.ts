"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createRecurringExpenseAccess, type RecurringExpenseCommand } from "./access";

const access = createRecurringExpenseAccess(prisma, requireUserId);

export type RunDueExpensesResult = Awaited<ReturnType<typeof access.runDue>> | { error: string };

export async function runDueExpenses(expenseGroupId: number): Promise<RunDueExpensesResult> {
  try {
    const result = await access.runDue(expenseGroupId);
    revalidatePath("/spending/[id]", "page");
    revalidatePath("/");
    return result;
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }
}

export async function changeRecurringExpense(
  expenseGroupId: number,
  id: number | null,
  command: RecurringExpenseCommand,
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  try {
    await access.change(expenseGroupId, id, command, formData);
    revalidatePath("/spending/[id]", "page");
    return { success: true };
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }
}
