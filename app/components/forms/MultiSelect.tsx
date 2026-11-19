"use client";

import { useId, type ReactNode } from "react";
import Checkbox from "./Checkbox";
import { fieldClass, fieldLabelClass } from "./field-styles";
import styles from "./select.module.css";

type MultiSelectProps = {
  label: string;
  name?: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  values: readonly string[];
  summary?: ReactNode;
  optionGroupLabel?: string;
  onChange: (value: string, checked: boolean) => void;
};

export default function MultiSelect({
  label, name, options, values, summary, optionGroupLabel = label, onChange,
}: MultiSelectProps) {
  const id = useId();
  const selected = new Set(values);

  return (
    <div className={fieldLabelClass}>
      <span id={`${id}-label`}>{label}</span>
      <details>
        <summary
          aria-labelledby={`${id}-label ${id}-summary`}
          className={`${fieldClass} ${styles.disclosure} content-center`}
        >
          <span id={`${id}-summary`}>{summary ?? `${values.length} selected`}</span>
        </summary>
        <fieldset className="mt-1 grid max-h-44 min-w-0 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-1">
          <legend className="sr-only">{optionGroupLabel}</legend>
          {options.map(({ value, label: optionLabel, disabled }) => (
            <label key={value} className="flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white has-disabled:cursor-not-allowed">
              <Checkbox
                name={name}
                value={value}
                checked={selected.has(value)}
                disabled={disabled}
                onChange={(event) => onChange(value, event.currentTarget.checked)}
              />
              <span className="min-w-0 wrap-anywhere">{optionLabel}</span>
            </label>
          ))}
        </fieldset>
      </details>
    </div>
  );
}
