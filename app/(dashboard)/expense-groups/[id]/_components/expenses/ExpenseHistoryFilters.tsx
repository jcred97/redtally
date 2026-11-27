"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";
import ExpenseHistoryDateFilters from "./ExpenseHistoryDateFilters";
import Select from "@/app/components/forms/Select";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import type { ExpenseHistoryProviderOption } from "@/app/(dashboard)/_lib/expense-groups/access";
import { nextExpenseHistoryScope } from "../../_lib/expenses/scope";

type ExpenseHistoryFiltersProps = {
  groupPath: string;
  filterQuery: string;
  categories: { id: number; name: string }[];
  providers: ExpenseHistoryProviderOption[];
  merchantLabel?: string;
  currentMonth: string;
  clearFiltersHref: string;
  canClearFilters: boolean;
};

const SEARCH_DELAY_MS = 300;

type FilterField = "month" | "day" | "category" | "paymentMethod" | "paymentProvider";

export default function ExpenseHistoryFilters({
  groupPath,
  filterQuery,
  categories,
  providers,
  merchantLabel,
  currentMonth,
  clearFiltersHref,
  canClearFilters,
}: ExpenseHistoryFiltersProps) {
  const router = useRouter();
  const searchTimer = useRef<number | undefined>(undefined);
  const [composing, setComposing] = useState(false);
  const appliedParams = new URLSearchParams(filterQuery);
  appliedParams.sort();
  const appliedQuery = appliedParams.toString();
  const appliedSearch = appliedParams.get("search") ?? merchantLabel ?? "";
  const [filters, setFilters] = useState({ appliedQuery, requestedQuery: appliedQuery, search: appliedSearch });

  if (filters.appliedQuery !== appliedQuery) {
    setFilters({
      appliedQuery,
      requestedQuery: appliedQuery,
      // A response can arrive after the user has continued typing.
      search: filters.requestedQuery === appliedQuery ? filters.search : appliedSearch,
    });
  }

  const params = new URLSearchParams(filters.requestedQuery);
  const day = params.get("day") ?? "";
  const month = day ? day.slice(0, 7) : params.get("month") ?? "";
  const through = params.get("through");
  const category = params.get("category") ?? "";
  const paymentMethod = params.get("paymentMethod") ?? "";
  const provider = params.get("paymentProvider") ?? params.get("bank") ?? "";
  const categoryUnavailable = category && !categories.some(({ id }) => String(id) === category);
  const selectedProvider = providers.find(({ value }) => value === provider);
  const eligibleProviders = paymentMethod
    ? providers.filter(({ paymentMethods }) => paymentMethods.some((method) => method === paymentMethod))
    : providers;
  const providerUnavailable = provider && !eligibleProviders.some(({ value }) => value === provider);
  const scopeHref = `${groupPath}?${nextExpenseHistoryScope(params, currentMonth)}`;
  const searchText = filters.search.trim();
  const needsSearch = params.has("merchant")
    ? filters.search !== merchantLabel
    : searchText !== (params.get("search") ?? "");

  function navigate(next: URLSearchParams, method: "push" | "replace") {
    next.delete("expense");
    next.sort();
    const requestedQuery = next.toString();
    if (requestedQuery === filters.requestedQuery) return;
    setFilters((current) => ({ ...current, requestedQuery }));
    router[method](requestedQuery ? `${groupPath}?${requestedQuery}` : groupPath, { scroll: false });
  }

  function changeFilter(field: FilterField, value: string) {
    const next = new URLSearchParams(filters.requestedQuery);
    if (field === "month") {
      if (value === month) return;
      next.delete("day");
      next.delete("through");
      next.delete("allMonths");
      if (value) next.set("month", value);
      else {
        next.delete("month");
        next.set("allMonths", "1");
      }
    } else if (field === "day") {
      if (value === day) return;
      if (value) {
        next.set("day", value);
        next.delete("month");
        next.delete("allMonths");
        next.delete("through");
      } else {
        next.delete("day");
        next.set("month", month);
      }
    } else if (field === "paymentProvider") {
      next.delete("bank");
      next.delete("paymentProvider");
      if (value) next.set(value.startsWith("pay-later:") ? "paymentProvider" : "bank", value);
    } else {
      if (value) next.set(field, value);
      else next.delete(field);
      if (field === "paymentMethod" && value && value !== paymentMethod && provider &&
        !selectedProvider?.paymentMethods.some((method) => method === value)) {
        next.delete("bank");
        next.delete("paymentProvider");
      }
    }
    navigate(next, "push");
  }

  const applySearch = useEffectEvent(() => {
    const next = new URLSearchParams(filters.requestedQuery);
    next.delete("merchant");
    if (searchText) next.set("search", searchText);
    else next.delete("search");
    navigate(next, "replace");
  });

  useEffect(() => {
    if (composing || !needsSearch) return;
    const timer = window.setTimeout(() => applySearch(), SEARCH_DELAY_MS);
    searchTimer.current = timer;
    const cancel = () => window.clearTimeout(timer);
    window.addEventListener("popstate", cancel);
    return () => {
      cancel();
      window.removeEventListener("popstate", cancel);
    };
  }, [composing, filters.search, needsSearch]);

  function cancelSearch() {
    window.clearTimeout(searchTimer.current);
  }

  return (
    <form
      aria-label="Expense history filters"
      onSubmit={(event) => event.preventDefault()}
      className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 md:grid-cols-3"
    >
      <label className={fieldLabelClass}>
        Search expenses
        <TextInput
          type="search"
          name="search"
          placeholder="Merchant or expense title"
          maxLength={100}
          value={filters.search}
          onChange={({ target: { value } }) => setFilters((current) => ({ ...current, search: value }))}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
        />
      </label>
      <ExpenseHistoryDateFilters month={month} day={day} onChange={changeFilter} />
      <div className={fieldLabelClass}>
        <label htmlFor="expense-filter-category">Category</label>
        <Select
          id="expense-filter-category"
          value={category}
          onChange={(value) => changeFilter("category", value)}
          options={[
            { value: "", label: "All Categories" },
            ...(categoryUnavailable ? [{ value: category, label: "Unavailable category" }] : []),
            ...categories.map(({ id, name }) => ({ value: String(id), label: name })),
          ]}
        />
      </div>
      <div className={fieldLabelClass}>
        <label htmlFor="expense-filter-payment-method">Payment Method</label>
        <Select
          id="expense-filter-payment-method"
          value={paymentMethod}
          onChange={(value) => changeFilter("paymentMethod", value)}
          options={[
            { value: "", label: "All Payment Methods" },
            ...Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <div className={fieldLabelClass}>
        <label htmlFor="expense-filter-payment-provider">Payment Provider</label>
        <Select
          id="expense-filter-payment-provider"
          value={provider}
          onChange={(value) => changeFilter("paymentProvider", value)}
          disabled={!provider && eligibleProviders.length === 0}
          options={[
            { value: "", label: "All Providers" },
            ...(providerUnavailable ? [{ value: provider, label: selectedProvider?.label ?? "Unavailable provider", disabled: true }] : []),
            ...eligibleProviders,
          ]}
        />
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-800 pt-3">
        {through && <span className="text-sm text-gray-400">Through {formatExpenseDate(through)}</span>}
        <Link href={scopeHref} onNavigate={cancelSearch} className="text-sm text-gray-300 underline underline-offset-4 hover:text-white">
          {day || through ? "Full month" : month ? "All months" : "This month"}
        </Link>
        {canClearFilters && (
          <Link href={clearFiltersHref} onNavigate={cancelSearch} className="text-sm text-gray-300 underline underline-offset-4 hover:text-white">
            Clear filters
          </Link>
        )}
      </div>
    </form>
  );
}
