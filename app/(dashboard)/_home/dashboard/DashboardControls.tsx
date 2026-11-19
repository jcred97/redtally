"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, type ReactNode } from "react";
import DashboardFilters from "./DashboardFilters";
import DashboardQuickEntry from "./DashboardQuickEntry";

type DashboardControlsProps = {
  groups: { publicId: string; name: string }[];
  entryId: string;
  scopeQuery: string;
  children: ReactNode;
};

export default function DashboardControls({ groups, entryId, scopeQuery, children }: DashboardControlsProps) {
  const router = useRouter();
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(scopeQuery);
  const params = new URLSearchParams(optimisticQuery);
  const selectedIds = params.getAll("group");
  const quickEntryId = params.get("entry") ?? selectedIds[0] ?? groups[0].publicId;

  function navigate(query: URLSearchParams, method: "push" | "replace" = "push") {
    const nextQuery = query.toString();
    if (nextQuery === optimisticQuery) return;
    startTransition(() => {
      setOptimisticQuery(nextQuery);
      router[method](`/?${nextQuery}`, { scroll: false });
    });
  }

  return (
    <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
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
      <DashboardQuickEntry
        groups={groups}
        entryId={quickEntryId}
        pending={quickEntryId !== entryId}
        onGroupChange={(publicId) => {
          if (publicId === quickEntryId) return;
          const next = new URLSearchParams(params);
          next.set("entry", publicId);
          navigate(next, "replace");
        }}
      >
        {children}
      </DashboardQuickEntry>
    </div>
  );
}
