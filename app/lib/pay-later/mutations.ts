"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createPayLaterAccess } from "./access";

const access = createPayLaterAccess(prisma);

export async function setGroupPayLaterProvider(formData: FormData): Promise<{ success: true } | { error: string }> {
  try {
    await access.setGroupPayLaterProvider(await requireUserId(), formData);
    revalidatePath("/expense-groups/[id]/[[...tab]]", "page");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }
}
