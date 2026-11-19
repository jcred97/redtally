import { useLayoutEffect, useRef } from "react";
import DateInput from "@/app/components/forms/DateInput";
import MultiSelect from "@/app/components/forms/MultiSelect";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { parseExpenseMonth } from "@/app/lib/expenses/date";

type DashboardFiltersProps = {
  month: string;
  groups: { publicId: string; name: string }[];
  selectedIds: string[];
  onMonthChange: (month: string) => void;
  onGroupChange: (publicId: string, checked: boolean) => void;
};

export default function DashboardFilters({ month, groups, selectedIds, onMonthChange, onGroupChange }: DashboardFiltersProps) {
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
          />
        </label>
        <p id="dashboard-month-timezone" className="mt-1 text-xs text-gray-400">Manila time</p>
      </div>
      <MultiSelect
        label="Expense groups"
        name="group"
        options={groups.map(({ publicId, name }) => ({ value: publicId, label: name }))}
        values={selectedIds}
        summary={`${selectedIds.length} included`}
        optionGroupLabel="Expense groups included in the report"
        onChange={onGroupChange}
      />
    </form>
  );
}
