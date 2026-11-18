import Form from "next/form";
import Link from "next/link";
import { formatExpenseDate } from "@/app/lib/expenses/date";
import { paymentMethodLabels } from "@/app/lib/expenses/payment";
import type { PaymentMethod } from "@/generated/prisma/enums";
import ExpenseHistoryDateFilters from "./ExpenseHistoryDateFilters";
import Select from "@/app/components/forms/Select";
import MerchantFilter from "./MerchantFilter";

type ExpenseHistoryFiltersProps = {
  expenseGroupId: number;
  groupPath: string;
  categories: { id: number; name: string }[];
  banks: { value: string; label: string }[];
  merchants: { value: string; label: string }[];
  month?: string;
  day?: string;
  through?: string;
  categoryId?: number;
  paymentMethod?: PaymentMethod;
  bank?: string;
  merchant?: string;
  monthScopeHref: string;
  clearFiltersHref: string;
  canClearFilters: boolean;
  grouped: boolean;
};

const fieldClass = "mt-1 block h-10 w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 text-base text-white [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-red-400 sm:text-sm";

export default function ExpenseHistoryFilters({
  expenseGroupId,
  groupPath,
  categories,
  banks,
  merchants,
  month,
  day,
  through,
  categoryId,
  paymentMethod,
  bank,
  merchant,
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
      className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 md:grid-cols-3"
    >
      {month === undefined && <input type="hidden" name="allMonths" value="1" />}
      {through && <input type="hidden" name="through" value={through} />}
      {grouped && <input type="hidden" name="view" value="grouped" />}
      <ExpenseHistoryDateFilters month={month} day={day} fieldClass={fieldClass} />
      <label className="min-w-0 text-sm text-gray-300">
        Category
        <Select name="category" defaultValue={categoryId ?? ""} className={fieldClass}>
          <option value="">All categories</option>
          {categoryUnavailable && <option value={categoryId}>Unavailable category</option>}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </label>
      <div className="min-w-0 text-sm text-gray-300">
        <label htmlFor="expense-filter-payment-method">Payment method</label>
        <Select
          id="expense-filter-payment-method"
          name="paymentMethod"
          defaultValue={paymentMethod ?? ""}
          className={fieldClass}
        >
          <option value="">All payment methods</option>
          {Object.entries(paymentMethodLabels).map(([method, label]) => (
            <option key={method} value={method}>{label}</option>
          ))}
        </Select>
      </div>
      <div className="min-w-0 text-sm text-gray-300">
        <label htmlFor="expense-filter-bank">Bank</label>
        <Select id="expense-filter-bank" name="bank" defaultValue={bank ?? ""} className={fieldClass}>
          <option value="">All banks</option>
          {bankUnavailable && <option value={bank}>Unavailable bank</option>}
          {banks.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>
      <MerchantFilter
        key={`${expenseGroupId}-${merchant ?? ""}`}
        expenseGroupId={expenseGroupId}
        merchants={merchants}
        merchant={merchant}
        fieldClass={fieldClass}
      />
      <div className="col-span-full flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-gray-800 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {through && <span className="text-sm text-gray-400">Through {formatExpenseDate(through)}</span>}
          <Link href={monthScopeHref} className="text-sm text-gray-300 underline underline-offset-4 hover:text-white">
            {day || through ? "Full month" : month === undefined ? "This month" : "All months"}
          </Link>
          {canClearFilters && (
            <Link href={clearFiltersHref} className="text-sm text-gray-300 underline underline-offset-4 hover:text-white">
              Clear filters
            </Link>
          )}
        </div>
        <button
          type="submit"
          className="button-secondary ml-auto h-10 whitespace-nowrap rounded-lg px-4 text-sm font-medium"
        >
          Apply filters
        </button>
      </div>
    </Form>
  );
}
