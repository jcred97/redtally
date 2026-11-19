import { useLayoutEffect, useRef } from "react";
import DateInput from "@/app/components/forms/DateInput";
import { fieldClass, fieldLabelClass } from "@/app/components/forms/field-styles";
import styles from "@/app/components/forms/select.module.css";
import { parseExpenseMonth } from "@/app/lib/expenses/date";

type DashboardFiltersProps = {
  month: string;
  groups: { publicId: string; name: string }[];
  selectedIds: string[];
  onMonthChange: (month: string) => void;
  onGroupChange: (publicId: string, checked: boolean) => void;
};

export default function DashboardFilters({ month, groups, selectedIds, onMonthChange, onGroupChange }: DashboardFiltersProps) {
  const included = new Set(selectedIds);
  const monthInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (monthInput.current) monthInput.current.value = month;
  }, [month]);

  return (
    <form
      aria-label="Dashboard filters"
      onSubmit={(event) => event.preventDefault()}
      className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2"
    >
      <div className={fieldLabelClass}>
        <label>
          Month
          <DateInput
            ref={monthInput}
            type="month"
            name="month"
            min="0001-01"
            max="9999-12"
            pattern="[0-9]{4}-(0[1-9]|1[0-2])"
            aria-describedby="dashboard-month-timezone"
            defaultValue={month}
            onChange={({ currentTarget: { value } }) => {
              const selectedMonth = parseExpenseMonth(value);
              if (selectedMonth) onMonthChange(selectedMonth);
            }}
            onBlur={({ currentTarget }) => {
              if (!parseExpenseMonth(currentTarget.value)) currentTarget.value = month;
            }}
            className={fieldClass}
          />
        </label>
        <p id="dashboard-month-timezone" className="mt-1 text-xs text-gray-400">Manila time</p>
      </div>
      <div className={fieldLabelClass}>
        <span id="dashboard-expense-groups-label">Expense groups</span>
        <details>
          <summary
            aria-labelledby="dashboard-expense-groups-label dashboard-expense-groups-count"
            className={`${fieldClass} ${styles.disclosure} content-center`}
          >
            <span id="dashboard-expense-groups-count">{selectedIds.length} included</span>
          </summary>
          <fieldset className="mt-1 grid max-h-44 min-w-0 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-1">
            <legend className="sr-only">Expense groups included in the report</legend>
            {groups.map(({ publicId, name }) => (
              <label key={publicId} className="flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white">
                <input
                  type="checkbox"
                  name="group"
                  value={publicId}
                  checked={included.has(publicId)}
                  onChange={(event) => onGroupChange(publicId, event.currentTarget.checked)}
                  className="size-4 shrink-0 accent-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                />
                <span className="min-w-0 wrap-anywhere">{name}</span>
              </label>
            ))}
          </fieldset>
        </details>
      </div>
    </form>
  );
}
