const expenseGroupTabs = ["dashboard", "expenses", "recurring", "categories", "payment-providers"] as const;
export type ExpenseGroupTab = (typeof expenseGroupTabs)[number];

export function isExpenseGroupTab(tab: string | string[] | undefined): tab is ExpenseGroupTab {
  return expenseGroupTabs.some((value) => value === tab);
}

export function expenseGroupTabSuffix(
  tab: ExpenseGroupTab,
  { month, grouped = false, payLater = false }: { month?: string; grouped?: boolean; payLater?: boolean },
) {
  if (tab === "dashboard") return month ? `/dashboard?month=${month}` : "";
  const params = new URLSearchParams();
  if (grouped) params.set("view", "grouped");
  if (tab === "payment-providers" && payLater) params.set("provider", "pay-later");
  return `/${tab}${params.size > 0 ? `?${params}` : ""}`;
}
