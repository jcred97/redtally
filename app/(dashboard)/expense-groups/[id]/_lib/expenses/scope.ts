export const expenseHistoryQueryKeys = [
  "expense", "month", "day", "through", "allMonths", "category", "paymentMethod",
  "paymentProvider", "bank", "merchant", "search", "merchantSearch", "page", "view",
];

export function nextExpenseHistoryScope(params: URLSearchParams, currentMonth: string) {
  const day = params.get("day");
  const month = params.get("month");
  const next = new URLSearchParams(params);
  next.delete("day");
  next.delete("month");
  next.delete("through");
  next.delete("allMonths");
  if (day || params.has("through") || !month) {
    next.set("month", day?.slice(0, 7) ?? month ?? currentMonth);
  } else {
    next.set("allMonths", "1");
  }
  return next;
}
