"use client";

import { useState } from "react";

export default function MerchantFilter({
  merchant,
  merchantLabel,
  merchantSearch,
  fieldClass,
}: {
  merchant?: string;
  merchantLabel?: string;
  merchantSearch?: string;
  fieldClass: string;
}) {
  const [search, setSearch] = useState(merchantSearch ?? merchantLabel ?? "");
  const keepExactFilter = merchant !== undefined && search === merchantLabel;

  return (
    <div className="min-w-0 text-sm text-gray-300">
      <label htmlFor="expense-filter-merchant">Merchant</label>
      <input
        id="expense-filter-merchant"
        type="search"
        name={keepExactFilter ? undefined : "merchantSearch"}
        placeholder="Search merchants"
        maxLength={100}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={fieldClass}
      />
      {keepExactFilter && <input type="hidden" name="merchant" value={merchant} />}
    </div>
  );
}
