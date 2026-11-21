"use client";

import { useId, useState } from "react";
import Select from "@/app/components/forms/Select";

export type CreditProviderOption = { key: string; name: string };

export default function CreditProviderField({ providers, value, onChange, required }: {
  providers: CreditProviderOption[];
  value: string;
  onChange: (key: string) => void;
  required: boolean;
}) {
  const id = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = `${id}-help`;
  const hasProviders = providers.length > 0;
  const emptyLabel = hasProviders ? "Select a credit provider" : "No credit providers available";
  const options = [
    { value: "", label: required ? emptyLabel : "No provider recorded", disabled: required },
    ...providers.map(({ key, name }) => ({ value: key, label: name })),
  ];

  return (
    <fieldset className="grid min-w-0 gap-4">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={`${id}-provider`} className="text-sm font-medium">Credit provider</label>
          <div
            className="relative"
            onPointerEnter={(event) => { if (event.pointerType === "mouse") setHelpOpen(true); }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse" && !event.currentTarget.querySelector(":focus-visible")) setHelpOpen(false);
            }}
          >
            <button
              type="button"
              aria-label="How to enable a credit provider"
              aria-describedby={helpId}
              className="grid size-6 cursor-pointer place-items-center rounded-full text-xs font-semibold text-gray-300 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
              onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setHelpOpen(true); }}
              onBlur={() => setHelpOpen(false)}
              onClick={() => setHelpOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && helpOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setHelpOpen(false);
                }
              }}
            >
              <span aria-hidden="true" className="grid size-4 place-items-center rounded-full border leading-none">?</span>
            </button>
            <div className="absolute right-0 bottom-full z-10 w-56 pb-1" hidden={!helpOpen}>
              <p id={helpId} role="tooltip" className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs text-gray-200 shadow-lg">
                Enable or add a provider in this group’s <strong>Payment Provider → Pay Later</strong> settings.
              </p>
            </div>
          </div>
        </div>
        <Select id={`${id}-provider`} name="creditProviderKey" value={value}
          onChange={onChange} options={options} disabled={!hasProviders} required={required} />
      </div>
    </fieldset>
  );
}
