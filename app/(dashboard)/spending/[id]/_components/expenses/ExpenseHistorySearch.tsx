"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SEARCH_DELAY_MS = 300;

export default function ExpenseHistorySearch({
  merchant,
  merchantLabel,
  initialSearch,
  fieldClass,
  groupPath,
  filterQuery,
}: {
  merchant?: string;
  merchantLabel?: string;
  initialSearch?: string;
  fieldClass: string;
  groupPath: string;
  filterQuery: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  const appliedValue = initialSearch ?? merchantLabel ?? "";
  const appliedParams = new URLSearchParams(filterQuery);
  appliedParams.sort();
  const appliedQuery = appliedParams.toString();
  const [draft, setDraft] = useState({
    appliedQuery,
    value: appliedValue,
    requestedQuery: undefined as string | undefined,
  });
  if (draft.appliedQuery !== appliedQuery) {
    // A live response can arrive after the user has already continued typing.
    setDraft({
      appliedQuery,
      value: draft.requestedQuery === appliedQuery ? draft.value : appliedValue,
      requestedQuery: undefined,
    });
  }
  const keepExactFilter = merchant !== undefined && draft.value === merchantLabel;
  const nextParams = new URLSearchParams(appliedQuery);
  if (!keepExactFilter) {
    const search = draft.value.trim();
    nextParams.delete("merchant");
    if (search) nextParams.set("search", search);
    else nextParams.delete("search");
  }
  nextParams.sort();
  const nextQuery = nextParams.toString();

  useEffect(() => {
    const shouldSearch = !composing && nextQuery !== (draft.requestedQuery ?? appliedQuery);
    const timer = shouldSearch ? window.setTimeout(() => {
      setDraft((current) => ({ ...current, requestedQuery: nextQuery }));
      router.replace(nextQuery ? `${groupPath}?${nextQuery}` : groupPath, { scroll: false });
    }, SEARCH_DELAY_MS) : undefined;
    const cancel = () => window.clearTimeout(timer);
    const form = input.current?.form;
    const handleLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link) return;
      cancel();
      if (link.hasAttribute("data-clear-filters")) form?.reset();
    };
    form?.addEventListener("submit", cancel, true);
    form?.addEventListener("click", handleLink, true);
    window.addEventListener("popstate", cancel);
    return () => {
      cancel();
      form?.removeEventListener("submit", cancel, true);
      form?.removeEventListener("click", handleLink, true);
      window.removeEventListener("popstate", cancel);
    };
  }, [appliedQuery, composing, draft.requestedQuery, groupPath, nextQuery, router]);

  return (
    <div className="min-w-0 text-sm text-gray-300">
      <label htmlFor="expense-filter-search">Search expenses</label>
      <input
        id="expense-filter-search"
        ref={input}
        type="search"
        name={keepExactFilter ? undefined : "search"}
        placeholder="Merchant or expense title"
        maxLength={100}
        value={draft.value}
        onChange={(event) => {
          const value = event.target.value;
          setDraft((current) => ({ ...current, value }));
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        className={fieldClass}
      />
      {keepExactFilter && <input type="hidden" name="merchant" value={merchant} />}
    </div>
  );
}
