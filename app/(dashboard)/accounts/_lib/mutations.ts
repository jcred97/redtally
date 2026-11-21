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
  if (formData.get("type") !== "PAY_LATER") return saveAccountChange(() => access.create(formData));

  const result = await saveAccountChange(() => access.createPayLater(formData));
  if ("success" in result) {
    revalidatePath("/spending/[id]", "page");
    revalidatePath("/");
  }
  return result;
}

export async function renameFinancialAccount(id: string, formData: FormData) {
  const result = await saveAccountChange(() => access.rename(id, formData));
  if ("success" in result) {
    revalidatePath("/spending/[id]", "page");
    revalidatePath("/");
  }
  return result;
}

export async function deleteFinancialAccount(id: string) {
  const result = await saveAccountChange(() => access.remove(id));
  if ("success" in result) {
    revalidatePath("/spending/[id]", "page");
    revalidatePath("/");
  }
  return result;
}
