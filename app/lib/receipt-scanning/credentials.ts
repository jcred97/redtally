import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { isReceiptProvider, type ReceiptConnection, type ReceiptProvider } from "./config";

export function encryptionKey() {
  const encoded = process.env.RECEIPT_SCANNER_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null;
  return Buffer.from(encoded, "base64");
}

export async function getReceiptConnection(userId: string): Promise<ReceiptConnection | null> {
  const connection = await prisma.receiptScanner.findUnique({
    where: { userId },
    select: { provider: true, keySuffix: true },
  });
  if (!connection || !isReceiptProvider(connection.provider)) return null;
  return { provider: connection.provider, keySuffix: connection.keySuffix };
}

export function encryptApiKey(key: Buffer, userId: string, provider: ReceiptProvider, apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(JSON.stringify([userId, provider])));
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptApiKey(key: Buffer, userId: string, provider: ReceiptProvider, encryptedKey: string) {
  const data = Buffer.from(encryptedKey, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(JSON.stringify([userId, provider])));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
