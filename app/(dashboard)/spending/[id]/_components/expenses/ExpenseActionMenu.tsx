"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useActionMenuKeyboard } from "@/app/components/menus/useActionMenuKeyboard";
import styles from "@/app/components/menus/action-menu.module.css";

export default function ExpenseActionMenu({
  title,
  focusKey,
  children,
}: {
  title: string;
  focusKey: string;
  children: ReactNode;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    if (!popover) return;
    const dismiss = () => popover.hidePopover();
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  function positionPopover() {
    const popover = popoverRef.current;
    const trigger = triggerRef.current;
    if (!popover || !trigger) return;
    const { top, bottom, right } = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - bottom;
    const placeAbove = spaceBelow < 120 && top > spaceBelow;
    popover.style.right = `${Math.max(8, window.innerWidth - right)}px`;
    popover.style.top = placeAbove ? "auto" : `${bottom + 4}px`;
    popover.style.bottom = placeAbove ? `${window.innerHeight - top + 4}px` : "auto";
  }

  function setMenuOpen(nextOpen: boolean) {
    if (nextOpen) {
      positionPopover();
      popoverRef.current?.showPopover();
    } else {
      popoverRef.current?.hidePopover();
    }
    setOpen(nextOpen);
  }

  const onKeyDown = useActionMenuKeyboard({ open, setOpen: setMenuOpen, triggerRef, panelRef: popoverRef });

  function dismissOnBlur(event: FocusEvent) {
    if (event.relatedTarget === triggerRef.current || popoverRef.current?.contains(event.relatedTarget)) return;
    if (event.target === triggerRef.current || popoverRef.current?.contains(event.target)) setMenuOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={id}
        onClick={positionPopover}
        onKeyDown={onKeyDown}
        onBlur={dismissOnBlur}
        data-dialog-focus-key={focusKey}
        aria-label={`Actions for ${title}`}
        aria-expanded={open}
        aria-controls={id}
        className={`${styles.trigger} inline-grid size-9 cursor-pointer place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-700 hover:text-white`}
      >
        <span aria-hidden="true" className="text-lg leading-none">⋯</span>
      </button>
      <div
        id={id}
        ref={popoverRef}
        popover="auto"
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={onKeyDown}
        onBlur={dismissOnBlur}
        className={`${styles.panel} fixed left-auto m-0 w-32 p-1 text-gray-100`}
      >
        {children}
      </div>
    </>
  );
}
