"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition, type ReactNode } from "react";

type DashboardQuickEntryProps = {
  groups: { publicId: string; name: string }[];
  entryId: string;
  scopeQuery: string;
  children: ReactNode;
};

export default function DashboardQuickEntry({ groups, entryId, scopeQuery, children }: DashboardQuickEntryProps) {
  const router = useRouter();
  const groupSelectId = useId();
  const [pending, startTransition] = useTransition();
  const currentGroup = groups.find(({ publicId }) => publicId === entryId);

  function chooseGroup(publicId: string) {
    const query = new URLSearchParams(scopeQuery);
    query.set("entry", publicId);
    startTransition(() => router.replace(`/?${query}`, { scroll: false }));
  }

  return (
    <section aria-labelledby="dashboard-entry-heading" className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
      <h2 id="dashboard-entry-heading" className="text-base font-semibold">Quick expense entry</h2>
      {groups.length > 1 ? (
        <div className="mt-3 min-w-0">
          <label htmlFor={groupSelectId} className="text-sm font-medium text-gray-200">Expense group</label>
          <select
            id={groupSelectId}
            value={entryId}
            disabled={pending}
            onChange={(event) => chooseGroup(event.currentTarget.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-gray-700 bg-background px-3 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-red-400"
          >
            {groups.map(({ publicId, name }) => <option key={publicId} value={publicId}>{name}</option>)}
          </select>
        </div>
      ) : (
        <p className="mt-2 wrap-anywhere text-sm text-gray-400">{currentGroup?.name}</p>
      )}
      <div className="mt-3" aria-busy={pending || undefined}>
        {pending ? <p role="status" className="text-sm text-gray-400">Loading expense group…</p> : children}
      </div>
    </section>
  );
}
