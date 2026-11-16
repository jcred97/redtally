import Form from "next/form";
import Link from "next/link";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";
import type { PaymentMethod } from "@/generated/prisma/enums";
import ExpenseHistoryDateFilters from "./ExpenseHistoryDateFilters";
import styles from "./ExpenseHistoryFilters.module.css";

type ExpenseHistoryFiltersProps = {
  groupPath: string;
  categories: { id: number; name: string }[];
  banks: { value: string; label: string }[];
  month?: string;
  day?: string;
  categoryId?: number;
  paymentMethod?: PaymentMethod;
  bank?: string;
  monthScopeHref: string;
  clearFiltersHref: string;
  canClearFilters: boolean;
  grouped: boolean;
};

const fieldClass = "mt-1 block h-10 w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 text-base text-white [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-red-400 sm:text-sm";

const selectClass = `${fieldClass} ${styles.select}`;

export default function ExpenseHistoryFilters({
  groupPath,
  categories,
  banks,
  month,
  day,
  categoryId,
  paymentMethod,
  bank,
  monthScopeHref,
  clearFiltersHref,
  canClearFilters,
  grouped,
}: ExpenseHistoryFiltersProps) {
  const categoryUnavailable =
    categoryId !== undefined && !categories.some((category) => category.id === categoryId);
  const bankUnavailable = bank !== undefined && !banks.some(({ value }) => value === bank);

  return (
    <Form
      action={groupPath}
      aria-label="Expense history filters"
      prefetch={false}
      className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] xl:items-end"
    >
      {month === undefined && <input type="hidden" name="allMonths" value="1" />}
      {grouped && <input type="hidden" name="view" value="grouped" />}
      <ExpenseHistoryDateFilters month={month} day={day} fieldClass={fieldClass} />
      <label className="min-w-0 text-sm text-gray-300">
        Category
        <select name="category" defaultValue={categoryId ?? ""} className={selectClass}>
          <option value="">All categories</option>
          {categoryUnavailable && <option value={categoryId}>Unavailable category</option>}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <div className="min-w-0">
        <label htmlFor="expense-filter-payment-method" className="text-sm text-gray-300">Payment method</label>
        <select
          id="expense-filter-payment-method"
          name="paymentMethod"
          defaultValue={paymentMethod ?? ""}
          className={selectClass}
        >
          <option value="">All payment methods</option>
          {Object.entries(paymentMethodLabels).map(([method, label]) => (
            <option key={method} value={method}>{label}</option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor="expense-filter-bank" className="text-sm text-gray-300">Bank</label>
        <select id="expense-filter-bank" name="bank" defaultValue={bank ?? ""} className={selectClass}>
          <option value="">All banks</option>
          {bankUnavailable && <option value={bank}>Unavailable bank</option>}
          {banks.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5 xl:col-span-1">
        <button
          type="submit"
          className="h-10 cursor-pointer rounded-lg border border-gray-700 px-3 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-red-400"
        >
          Apply filters
        </button>
        <Link href={monthScopeHref} className="text-sm text-gray-300 underline hover:text-white">
          {day ? "Full month" : month === undefined ? "This month" : "All months"}
        </Link>
        {canClearFilters && (
          <Link href={clearFiltersHref} className="text-sm text-gray-300 underline hover:text-white">
            Clear filters
          </Link>
        )}
      </div>
    </Form>
  );
}
