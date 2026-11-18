"use client";

import type { ComponentPropsWithRef } from "react";
import styles from "./fields.module.css";

type DateInputProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  type?: "date" | "month" | "time";
};

export default function DateInput({
  type = "date",
  className = "",
  onClick,
  ...props
}: DateInputProps) {
  return (
    <input
      {...props}
      type={type}
      className={`${styles.dateInput} ${className}`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;

        try {
          event.currentTarget.showPicker?.();
        } catch {
          // Native entry remains available when the browser restricts opening its picker.
        }
      }}
    />
  );
}
