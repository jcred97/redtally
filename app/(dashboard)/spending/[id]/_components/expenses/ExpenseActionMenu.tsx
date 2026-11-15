"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";

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

  function positionPopover(event: MouseEvent<HTMLButtonElement>) {
    const popover = popoverRef.current;
    if (!popover) return;
    const { top, bottom, right } = event.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - bottom;
    const placeAbove = spaceBelow < 120 && top > spaceBelow;
    popover.style.right = `${Math.max(8, window.innerWidth - right)}px`;
    popover.style.top = placeAbove ? "auto" : `${bottom + 4}px`;
    popover.style.bottom = placeAbove ? `${window.innerHeight - top + 4}px` : "auto";
  }

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        onClick={positionPopover}
        data-dialog-focus-key={focusKey}
        aria-label={`Actions for ${title}`}
        className="inline-grid size-9 cursor-pointer place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-700 hover:text-white focus-visible:outline-2 focus-visible:outline-red-400"
      >
        <span aria-hidden="true" className="text-lg leading-none">⋯</span>
      </button>
      <div
        id={id}
        ref={popoverRef}
        popover="auto"
        onToggle={(event) => setOpen(event.newState === "open")}
        className="fixed left-auto m-0 w-32 rounded-lg border border-gray-700 bg-gray-900 p-1 text-gray-100 shadow-xl"
      >
        {children}
      </div>
    </>
  );
}
