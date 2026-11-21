"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createFinancialAccountAccess } from "./access";

const access = createFinancialAccountAccess(prisma, requireUserId);

async function saveAccountChange(change: () => Promise<unknown>): Promise<{ success: true } | { error: string }> {
  try {
    await change();
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }

  revalidatePath("/accounts");
  return { success: true };
}

export async function createFinancialAccount(formData: FormData) {
  return saveAccountChange(() => access.create(formData));
}

export async function renameFinancialAccount(id: string, formData: FormData) {
  return saveAccountChange(() => access.rename(id, formData));
}

export async function deleteFinancialAccount(id: string) {
  const result = await saveAccountChange(() => access.remove(id));
  if ("success" in result) {
    revalidatePath("/spending/[id]", "page");
    revalidatePath("/");
  }
  return result;
}
