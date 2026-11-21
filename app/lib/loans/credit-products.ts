export const spayLaterProduct = { provider: "Shopee", key: "spaylater", name: "SPayLater" } as const;

export const creditProducts = [
  spayLaterProduct,
  { provider: "Lazada", key: "lazpaylater", name: "LazPayLater" },
  { provider: "GCash", key: "ggives", name: "GGives" },
  { provider: "Atome", key: "atome card", name: "Atome Card" },
  { provider: "BillEase", key: "billease", name: "BillEase" },
  { provider: "Home Credit", key: "home credit installment shopping", name: "Home Credit Installment Shopping" },
] as const;
