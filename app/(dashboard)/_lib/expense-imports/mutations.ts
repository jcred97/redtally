"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireUserId } from "@/app/lib/auth/session";
import type { ExpenseImportRow } from "@/app/lib/expenses/import";
import { createExpenseImportAccess } from "./access";

const access = createExpenseImportAccess(prisma, requireUserId);

export async function previewExpenseImport(
  expenseGroupId: number,
  rows: ExpenseImportRow[],
): Promise<{ duplicates: number[] } | { error: string }> {
  try {
    return { duplicates: await access.preview(expenseGroupId, rows) };
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }
}

export async function saveExpenseImport(
  expenseGroupId: number,
  categoryId: number,
  rows: ExpenseImportRow[],
): Promise<{ count: number } | { error: string }> {
  let count: number;
  try {
    count = await access.save(expenseGroupId, categoryId, rows);
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/spending/${expenseGroupId}`);
  revalidatePath("/");
  return { count };
}
