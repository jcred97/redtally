"use client";

import { useParams, useSearchParams } from "next/navigation";
import ExpenseGroupSettings from "@/app/(dashboard)/_components/expense-groups/ExpenseGroupSettings";
import ExpenseGroupSwitcher from "@/app/(dashboard)/_components/expense-groups/ExpenseGroupSwitcher";
import { parseExpenseMonth } from "@/app/lib/expenses/date";
import { expenseGroupTabSuffix, isExpenseGroupTab } from "../_lib/tabs";

type Group = { id: number; publicId: string; name: string };

export default function ExpenseGroupHeader({ group, groups }: { group: Group; groups: Group[] }) {
  const { tab: segments = [] } = useParams<{ tab?: string[] }>();
  const searchParams = useSearchParams();
  const [tab = "dashboard"] = segments;
  if (segments.length > 1 || !isExpenseGroupTab(tab)) return null;

  function readParam(name: string) {
    const values = searchParams.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  }

  const tabSuffix = expenseGroupTabSuffix(tab, {
    month: parseExpenseMonth(readParam("month")),
    grouped: readParam("view") === "grouped",
    payLater: readParam("provider") === "pay-later",
  });

  return (
    <header className="flex items-center justify-between gap-4 pt-6">
      <ExpenseGroupSwitcher currentGroup={group} groups={groups} tabSuffix={tabSuffix} />
      <ExpenseGroupSettings group={group} tabSuffix={tabSuffix} />
    </header>
  );
}
