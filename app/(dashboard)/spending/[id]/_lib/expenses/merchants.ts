"use server";

import { getExpenseHistoryMerchantOptionsByExpenseGroupId } from "@/app/(dashboard)/_lib/expense-groups/queries";

export async function searchExpenseMerchants(groupId: number, search: string, selected?: string) {
  return getExpenseHistoryMerchantOptionsByExpenseGroupId(groupId, search, selected);
}
