"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createFinancialAccountAccess } from "./access";

const access = createFinancialAccountAccess(prisma, requireUserId);

export async function createFinancialAccount(formData: FormData): Promise<{ success: true } | { error: string }> {
  try {
    await access.create(formData);
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }

  revalidatePath("/accounts");
  return { success: true };
}
