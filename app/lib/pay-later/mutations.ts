"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/app/lib/auth/session";
import { prisma } from "@/server/db/client";
import { createPayLaterAccess } from "./access";

const access = createPayLaterAccess(prisma);

async function save(operation: (userId: string) => Promise<unknown>): Promise<{ success: true } | { error: string }> {
  try {
    await operation(await requireUserId());
    revalidatePath("/spending/[id]", "page");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    if (error instanceof TypeError) return { error: error.message };
    throw error;
  }
}

export async function setGroupPayLaterProvider(formData: FormData) {
  return save((userId) => access.setGroupPayLaterProvider(userId, formData));
}

export async function createGroupPayLaterProvider(formData: FormData) {
  return save((userId) => access.createGroupPayLaterProvider(userId, formData));
}
