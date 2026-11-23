"use client";

import { useLayoutEffect, useRef } from "react";
import DateInput from "@/app/components/forms/DateInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import { parseExpenseDay, parseExpenseMonth } from "@/app/lib/expenses/date";

export default function ExpenseHistoryDateFilters({
  month,
  day,
  onChange,
}: {
  month: string;
  day: string;
  onChange: (field: "month" | "day", value: string) => void;
}) {
  const monthInput = useRef<HTMLInputElement>(null);
  const dayInput = useRef<HTMLInputElement>(null);

  // Leave incomplete native date edits in the input until the browser has a valid value.
  useLayoutEffect(() => {
    if (monthInput.current) monthInput.current.value = month;
  }, [month]);
  useLayoutEffect(() => {
    if (dayInput.current) dayInput.current.value = day;
  }, [day]);

  return (
    <>
      <label className={fieldLabelClass}>
        Month
        <DateInput
          ref={monthInput}
          type="month"
          name="month"
          defaultValue={month}
          min="0001-01"
          max="9999-12"
          pattern="[0-9]{4}-(0[1-9]|1[0-2])"
          placeholder="YYYY-MM"
          onChange={({ currentTarget: { value, validity } }) => {
            if (validity.valid && (!value || parseExpenseMonth(value))) onChange("month", value);
          }}
        />
      </label>
      <label className={fieldLabelClass}>
        Day <span className="text-gray-400">(optional)</span>
        <DateInput
          ref={dayInput}
          type="date"
          name="day"
          defaultValue={day}
          min="0001-01-01"
          max="9999-12-31"
          onChange={({ currentTarget: { value, validity } }) => {
            if (validity.valid && (!value || parseExpenseDay(value))) onChange("day", value);
          }}
        />
      </label>
    </>
  );
}
