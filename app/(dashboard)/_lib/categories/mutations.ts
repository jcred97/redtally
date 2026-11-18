"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/client";
import { requireUserId } from "@/app/lib/auth/session";
import { createCategoryAccess } from "./access";

const access = createCategoryAccess(prisma, requireUserId);

export type CategoryActionState = { error: string } | { success: true } | null;

export async function createCategory(
  previousState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const expenseGroupId = readId(formData, "expenseGroupId");
  return saveCategoryChange(() =>
    access.create(expenseGroupId, formData.get("name"))
  );
}

export async function updateCategory(
  previousState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const expenseGroupId = readId(formData, "expenseGroupId");
  const categoryId = readId(formData, "categoryId");
  return saveCategoryChange(() =>
    access.update(expenseGroupId, categoryId, formData.get("name"))
  );
}

export async function deleteCategory(
  previousState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const expenseGroupId = readId(formData, "expenseGroupId");
  const categoryId = readId(formData, "categoryId");
  return saveCategoryChange(() =>
    access.delete(expenseGroupId, categoryId)
  );
}

function readId(formData: FormData, field: string): number {
  const value = formData.get(field);
  return typeof value === "string" ? Number(value) : NaN;
}

async function saveCategoryChange(
  change: () => Promise<unknown>
): Promise<CategoryActionState> {
  try {
    await change();
  } catch (error) {
    if (error instanceof TypeError) {
      return { error: error.message };
    }

    throw error;
  }

  revalidatePath("/spending/[id]", "page");
  revalidatePath("/");
  revalidatePath("/expense-groups");

  return { success: true };
}
