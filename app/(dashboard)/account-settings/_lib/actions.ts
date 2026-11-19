"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/app/lib/auth/session";
import { getReceiptConnection, encryptApiKey, encryptionKey } from "@/app/lib/receipt-scanning/credentials";
import { isReceiptProvider, type ReceiptConnection } from "@/app/lib/receipt-scanning/config";
import { ReceiptProviderError, testReceiptProvider } from "@/app/lib/receipt-scanning/provider";
import { prisma } from "@/server/db/client";
import { isProfilePhoto } from "@/app/lib/auth/profile-photo";

type ConnectionResult = { connection: ReceiptConnection | null } | { error: string };
const signInMessage = "Sign in again to manage your settings.";

export async function loadReceiptConnection(): Promise<ConnectionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: signInMessage };
  return { connection: await getReceiptConnection(user.id) };
}

export async function saveReceiptConnection(form: FormData): Promise<ConnectionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: signInMessage };
  const provider = form.get("provider");
  const suppliedKey = form.get("apiKey");
  const apiKey = typeof suppliedKey === "string" ? suppliedKey.trim() : "";
  if (!isReceiptProvider(provider) || !/^[\x21-\x7e]{12,512}$/.test(apiKey)) {
    return { error: "Choose a provider and enter a valid API key." };
  }

  const key = encryptionKey();
  if (!key) return { error: "AI scanning is unavailable on this installation. Contact the RedTally administrator." };

  try {
    await testReceiptProvider(provider, apiKey);
    const keySuffix = apiKey.slice(-4);
    const data = { provider, keySuffix, encryptedKey: encryptApiKey(key, user.id, provider, apiKey) };
    await prisma.receiptScanner.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    revalidatePath("/account-settings");
    return { connection: { provider, keySuffix } };
  } catch (error) {
    return { error: error instanceof ReceiptProviderError ? error.message : "Could not save your connection. Try again." };
  }
}

export async function disconnectReceiptScanner(): Promise<ConnectionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: signInMessage };
  try {
    await prisma.receiptScanner.deleteMany({ where: { userId: user.id } });
    revalidatePath("/account-settings");
    return { connection: null };
  } catch {
    return { error: "Could not disconnect the provider. Try again." };
  }
}

export async function saveProfilePhoto(photo: string | null) {
  const user = await getCurrentUser();
  if (!user) return { error: signInMessage };
  if (photo !== null && !isProfilePhoto(photo)) return { error: "Choose a valid profile photo." };

  try {
    await prisma.user.update({ where: { id: user.id }, data: { image: photo } });
    revalidatePath("/", "layout");
    return { error: null };
  } catch {
    return { error: "Could not save your profile photo. Try again." };
  }
}
