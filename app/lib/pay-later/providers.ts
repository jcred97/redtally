import type { PayLaterProviderAssignment } from "@/generated/prisma/client";

export type PayLaterProviderOption = Pick<PayLaterProviderAssignment, "providerKey"> & { providerName: string };
export type PayLaterProviderSetting = PayLaterProviderOption & Pick<PayLaterProviderAssignment, "active" | "productEnabled">;

export const presetPayLaterProviders = [
  { providerKey: "shopee", providerName: "SPayLater" },
  { providerKey: "lazada", providerName: "Lazada" },
  { providerKey: "gcash", providerName: "GCash" },
  { providerKey: "atome", providerName: "Atome" },
  { providerKey: "billease", providerName: "BillEase" },
  { providerKey: "home-credit", providerName: "Home Credit" },
] as const satisfies readonly PayLaterProviderOption[];

export function customPayLaterProviderKey(name: string) {
  return `custom:${name.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export function getPayLaterProviderName(providerKey: string, savedName?: string | null) {
  return presetPayLaterProviders.find((provider) => provider.providerKey === providerKey)?.providerName
    ?? savedName ?? providerKey.replace(/^custom:/, "");
}
