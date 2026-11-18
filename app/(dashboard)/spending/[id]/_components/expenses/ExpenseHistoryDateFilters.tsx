"use client";

import { useRef } from "react";
import DateInput from "@/app/components/forms/DateInput";

export default function ExpenseHistoryDateFilters({
  month,
  day,
  fieldClass,
}: {
  month?: string;
  day?: string;
  fieldClass: string;
}) {
  const monthInput = useRef<HTMLInputElement>(null);
  const dayInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <label className="min-w-0 text-sm text-gray-300">
        Month
        <DateInput
          ref={monthInput}
          type="month"
          name="month"
          defaultValue={month ?? ""}
          min="0001-01"
          max="9999-12"
          pattern="[0-9]{4}-(0[1-9]|1[0-2])"
          placeholder="YYYY-MM"
          className={fieldClass}
          onInput={(event) => {
            if (dayInput.current && dayInput.current.value.slice(0, 7) !== event.currentTarget.value) {
              dayInput.current.value = "";
            }
          }}
        />
      </label>
      <label className="min-w-0 text-sm text-gray-300">
        Day <span className="text-gray-400">(optional)</span>
        <DateInput
          ref={dayInput}
          type="date"
          name="day"
          defaultValue={day ?? ""}
          min="0001-01-01"
          max="9999-12-31"
          className={fieldClass}
          onInput={(event) => {
            const value = event.currentTarget.value;
            if (monthInput.current && value.length === 10) {
              monthInput.current.value = value.slice(0, 7);
            }
          }}
        />
      </label>
    </>
  );
}
