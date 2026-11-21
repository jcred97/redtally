"use client";

import { useId, useState } from "react";
import Select from "@/app/components/forms/Select";

export type CreditAccountOption = { id: string; name: string };

export default function CreditAccountFields({ creditAccounts, hidden }: {
  creditAccounts: CreditAccountOption[];
  hidden: boolean;
}) {
  const id = useId();
  const [selectedId, setSelectedId] = useState<string>();
  const [helpOpen, setHelpOpen] = useState(false);
  const account = creditAccounts.find(({ id }) => id === selectedId) ?? creditAccounts[0];
  const helpId = `${id}-help`;
  const options = account
    ? creditAccounts.map(({ id, name }) => ({ value: id, label: name }))
    : [{ value: "", label: "No credit accounts available" }];

  return (
    <fieldset disabled={hidden} hidden={hidden} className={hidden ? undefined : "grid min-w-0 gap-4"}>
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={`${id}-account`} className="text-sm font-medium">Credit provider</label>
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
                Create a Pay Later account in <strong>Accounts → Add Account</strong>. To make it available here, enable the provider in this group’s <strong>Payment Provider → Pay Later</strong> settings.
              </p>
            </div>
          </div>
        </div>
        <Select id={`${id}-account`} name="creditAccountId" value={account?.id ?? ""}
          onChange={setSelectedId} options={options} disabled={!account} />
      </div>
    </fieldset>
  );
}
