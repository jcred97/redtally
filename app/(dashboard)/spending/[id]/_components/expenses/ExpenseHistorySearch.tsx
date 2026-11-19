"use client";

import { useState } from "react";

export default function ExpenseHistorySearch({
  merchant,
  merchantLabel,
  initialSearch,
  fieldClass,
}: {
  merchant?: string;
  merchantLabel?: string;
  initialSearch?: string;
  fieldClass: string;
}) {
  const [search, setSearch] = useState(initialSearch ?? merchantLabel ?? "");
  const keepExactFilter = merchant !== undefined && search === merchantLabel;

  return (
    <div className="min-w-0 text-sm text-gray-300">
      <label htmlFor="expense-filter-search">Search expenses</label>
      <input
        id="expense-filter-search"
        type="search"
        name={keepExactFilter ? undefined : "search"}
        placeholder="Merchant or expense title"
        maxLength={100}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={fieldClass}
      />
      {keepExactFilter && <input type="hidden" name="merchant" value={merchant} />}
    </div>
  );
}
