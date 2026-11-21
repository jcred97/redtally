export const payLaterProviders = [
  { key: "shopee", name: "Shopee" },
  { key: "lazada", name: "Lazada" },
  { key: "gcash", name: "GCash" },
  { key: "atome", name: "Atome" },
  { key: "billease", name: "BillEase" },
  { key: "home-credit", name: "Home Credit" },
] as const;

export function customPayLaterProviderKey(name: string) {
  return `custom:${name.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export function getPayLaterProviderName(key: string, customName?: string | null) {
  return payLaterProviders.find((provider) => provider.key === key)?.name ?? customName ?? key.replace(/^custom:/, "");
}
