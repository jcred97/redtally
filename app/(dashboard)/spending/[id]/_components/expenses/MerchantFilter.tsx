"use client";

import { useEffect, useId, useState } from "react";
import Select from "@/app/components/forms/Select";
import { searchExpenseMerchants } from "../../_lib/expenses/merchants";

type MerchantOption = { value: string; label: string };

export default function MerchantFilter({
  expenseGroupId,
  merchants,
  merchant,
  fieldClass,
}: {
  expenseGroupId: number;
  merchants: MerchantOption[];
  merchant?: string;
  fieldClass: string;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(merchant ?? "");
  const [options, setOptions] = useState(merchants);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setStatus("Searching merchants…");
      try {
        const results = await searchExpenseMerchants(expenseGroupId, search, selected);
        if (active) {
          setOptions(results);
          setStatus(results.length === 25
            ? "Showing up to 25 merchants. Refine your search for more."
            : results.length === 0 ? "No matching merchants." : "");
        }
      } catch {
        if (active) setStatus("Could not search merchants. Try again.");
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [expenseGroupId, search, selected]);

  const selectedOption = options.find(({ value }) => value === selected)
    ?? merchants.find(({ value }) => value === selected);
  const visibleOptions = selectedOption && !options.some(({ value }) => value === selected)
    ? [selectedOption, ...options]
    : options;

  return (
    <div className="min-w-0 text-sm text-gray-300">
      <label htmlFor={`${id}-merchant`}>Merchant</label>
      <input
        type="search"
        aria-label="Search merchants"
        aria-describedby={`${id}-status`}
        placeholder="Search merchants"
        maxLength={100}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={fieldClass}
      />
      <Select
        id={`${id}-merchant`}
        name="merchant"
        value={selected}
        onChange={setSelected}
        className={fieldClass}
        options={[
          { value: "", label: "All merchants" },
          { value: "none", label: "No merchant" },
          ...(selected && selected !== "none" && !selectedOption ? [{ value: selected, label: "Unavailable merchant" }] : []),
          ...visibleOptions,
        ]}
      />
      <p id={`${id}-status`} role="status" className="mt-1 text-xs text-gray-400">{status}</p>
    </div>
  );
}
