"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import DashboardFilters from "./DashboardFilters";

type DashboardControlsProps = {
  groups: { publicId: string; name: string }[];
  scopeQuery: string;
};

export default function DashboardControls({ groups, scopeQuery }: DashboardControlsProps) {
  const router = useRouter();
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(scopeQuery);
  const params = new URLSearchParams(optimisticQuery);
  const selectedIds = params.getAll("group");

  function navigate(query: URLSearchParams) {
    const nextQuery = query.toString();
    if (nextQuery === optimisticQuery) return;
    startTransition(() => {
      setOptimisticQuery(nextQuery);
      router.push(`/?${nextQuery}`, { scroll: false });
    });
  }

  return (
    <DashboardFilters
      month={params.get("month") ?? ""}
      groups={groups}
      selectedIds={selectedIds}
      onMonthChange={(month) => {
        const next = new URLSearchParams(params);
        next.set("month", month);
        navigate(next);
      }}
      onGroupChange={(publicId, checked) => {
        const included = new Set(selectedIds);
        if (checked) included.add(publicId);
        else included.delete(publicId);
        const next = new URLSearchParams(params);
        next.delete("group");
        for (const group of groups) {
          if (included.has(group.publicId)) next.append("group", group.publicId);
        }
        navigate(next);
      }}
    />
  );
}
