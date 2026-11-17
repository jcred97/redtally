"use client";

import { useRef } from "react";
import styles from "./ExpenseHistoryFilters.module.css";

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
        <input
          ref={monthInput}
          type="month"
          name="month"
          defaultValue={month ?? ""}
          min="0001-01"
          max="9999-12"
          pattern="[0-9]{4}-(0[1-9]|1[0-2])"
          placeholder="YYYY-MM"
          className={`${fieldClass} ${styles.dateTime}`}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // Keep native month entry available when the browser restricts opening its picker.
            }
          }}
          onInput={(event) => {
            if (dayInput.current && dayInput.current.value.slice(0, 7) !== event.currentTarget.value) {
              dayInput.current.value = "";
            }
          }}
        />
      </label>
      <label className="min-w-0 text-sm text-gray-300">
        Day <span className="text-gray-400">(optional)</span>
        <input
          ref={dayInput}
          type="date"
          name="day"
          defaultValue={day ?? ""}
          min="0001-01-01"
          max="9999-12-31"
          className={`${fieldClass} ${styles.dateTime}`}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // Keep native date entry available when the browser restricts opening its picker.
            }
          }}
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
