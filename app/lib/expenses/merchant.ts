export function parseMerchant(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || value.includes("\0")) throw new TypeError("Enter a valid merchant name.");

  const merchant = value.trim();
  if (merchant.length > 100) throw new TypeError("Merchant must be 100 characters or fewer.");
  return merchant || null;
}
