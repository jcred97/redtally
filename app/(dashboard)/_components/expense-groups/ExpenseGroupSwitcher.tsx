"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styles from "@/app/components/menus/action-menu.module.css";
import { useActionMenuKeyboard } from "@/app/components/menus/useActionMenuKeyboard";
import NewExpenseGroupButton from "./NewExpenseGroupButton";

type ExpenseGroupOption = { id: number; publicId: string; name: string };

export default function ExpenseGroupSwitcher({
  currentGroup,
  groups,
  tabSuffix = "",
}: {
  currentGroup?: ExpenseGroupOption;
  groups: ExpenseGroupOption[];
  tabSuffix?: string;
}) {
  const panelId = useId();
  const switcherRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const handleMenuKeyDown = useActionMenuKeyboard({ open, setOpen, triggerRef, panelRef });
  const onGroupList = currentGroup === undefined;
  const title = currentGroup?.name ?? "All Expense Groups";

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        !switcherRef.current?.contains(event.target) &&
        !event.target.closest("dialog")
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function closeAndFocusTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      ref={switcherRef}
      className="relative w-fit min-w-0 max-w-full"
      onBlur={(event) => {
        const next = event.relatedTarget;
        // The create dialog is rendered in a portal and returns focus to its trigger.
        if (next && !event.currentTarget.contains(next) && !next.closest("dialog")) {
          setOpen(false);
        }
      }}
      onKeyDown={handleMenuKeyDown}
    >
      <h1
        id={onGroupList ? "expense-groups-title" : "expense-group-title"}
        tabIndex={-1}
        className={`font-bold tracking-tight sm:text-3xl ${onGroupList ? "text-lg" : "text-2xl"}`}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${title}, switch expense group`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className={`${styles.trigger} inline-flex max-w-full cursor-pointer items-center gap-2 rounded-sm text-left hover:text-gray-200`}
        >
          <span className="min-w-0 wrap-anywhere">{title}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h1>

      <div
        id={panelId}
        ref={panelRef}
        hidden={!open}
        className={`${styles.panel} absolute top-full left-0 z-10 mt-2 w-64 max-w-[calc(100vw-3rem)] p-1 text-gray-200`}
      >
        <nav aria-label="Switch expense group">
          <Link
            href="/"
            aria-current={onGroupList ? "page" : undefined}
            onNavigate={(event) => {
              if (onGroupList) event.preventDefault();
              closeAndFocusTrigger();
            }}
            className={`${styles.item} flex items-start gap-2 px-4 py-3 text-sm ${onGroupList ? "bg-red-500/15 font-semibold text-red-300" : ""}`}
          >
            <span aria-hidden="true" className="w-4 shrink-0 text-red-400">
              {onGroupList && "✓"}
            </span>
            <span>
              All expense groups
              <span className="mt-0.5 block text-xs font-normal text-gray-400">
                {groups.length} {groups.length === 1 ? "group" : "groups"}
              </span>
            </span>
          </Link>
          <ul className="max-h-60 overflow-y-auto overscroll-contain">
            {groups.map((group) => {
              const selected = group.id === currentGroup?.id;
              return (
                <li key={group.id}>
                  <Link
                    href={`/spending/${group.publicId}${tabSuffix}`}
                    prefetch={false}
                    aria-current={selected ? "page" : undefined}
                    onNavigate={closeAndFocusTrigger}
                    className={`${styles.item} flex items-start gap-2 px-4 py-2.5 text-sm ${selected ? "bg-red-500/15 font-semibold text-red-300" : ""}`}
                  >
                    <span aria-hidden="true" className="w-4 shrink-0 text-red-400">
                      {selected && "✓"}
                    </span>
                    <span className="min-w-0 wrap-anywhere">{group.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-gray-800 py-1">
          <NewExpenseGroupButton inSwitcher />
        </div>
      </div>
    </div>
  );
}
