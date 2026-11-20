export const creditAccountsHref = "/expense-groups/credit-accounts";

export function creditAccountHref(id: string) {
  return `${creditAccountsHref}/${encodeURIComponent(id)}`;
}
