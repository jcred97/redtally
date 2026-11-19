import { getCurrentUser } from "@/app/lib/auth/session";
import { isReceiptProvider, maxAiImageBytes, providers, receiptImageTypes } from "@/app/lib/receipt-scanning/config";
import { decryptApiKey, encryptionKey } from "@/app/lib/receipt-scanning/credentials";
import { ReceiptProviderError, scanWithProvider } from "@/app/lib/receipt-scanning/provider";
import { prisma } from "@/server/db/client";

const fail = (error: string, status: number) => Response.json({ error }, { status });

async function readImage(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, size);
    size += value.byteLength;
    if (size > maxAiImageBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

function matchesImageType(image: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return image.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === "image/png") return image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  return image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP";
}

export async function POST(request: Request) {
  const origin = process.env.BETTER_AUTH_URL;
  if (!origin || request.headers.get("Origin") !== new URL(origin).origin) {
    return fail("Open RedTally to scan a receipt.", 403);
  }

  const user = await getCurrentUser();
  if (!user) return fail("Sign in again to scan this receipt.", 401);

  const provider = request.headers.get("X-Receipt-Provider");
  const mimeType = request.headers.get("Content-Type");
  if (!isReceiptProvider(provider) || !mimeType || !receiptImageTypes.includes(mimeType)) {
    return fail("Choose a PNG, JPEG, or WebP receipt and confirm the provider.", 400);
  }
  if (Number(request.headers.get("Content-Length")) > maxAiImageBytes) {
    return fail("Choose a smaller image or crop it to the receipt.", 413);
  }

  const key = encryptionKey();
  if (!key) return fail("AI scanning is unavailable on this installation.", 503);

  const connection = await prisma.receiptScanner.findUnique({ where: { userId: user.id } });
  if (connection?.provider !== provider) {
    return fail("Your receipt scanning connection changed. Confirm the provider before scanning again.", 409);
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(key, user.id, provider, connection.encryptedKey);
  } catch {
    return fail(`Replace your ${providers[provider]} API key in Account settings and try again.`, 409);
  }

  try {
    const image = await readImage(request);
    if (!image) return fail("Choose a smaller image or crop it to the receipt.", 413);
    if (!matchesImageType(image, mimeType)) return fail("Choose a valid receipt image.", 400);
    const suggestions = await scanWithProvider(provider, apiKey, {
      mimeType, base64: image.toString("base64"),
    }, request.signal);
    return Response.json({ suggestions });
  } catch (error) {
    return fail(error instanceof ReceiptProviderError ? error.message : "Could not scan this receipt. Try again.", 502);
  }
}
