"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type NavigationLink = {
  label: string;
  href: string;
  ariaCurrent?: "page" | "location";
};

const iconButtonClass = "inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-gray-200 transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400";

export default function MobileNavigation({ links, pathname }: { links: NavigationLink[]; pathname: string }) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 40rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) dialogRef.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function closeNavigation() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        className={`${iconButtonClass} sm:hidden`}
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <dialog
        id={dialogId}
        ref={dialogRef}
        aria-labelledby={`${dialogId}-title`}
        className="mobile-navigation-drawer fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-white backdrop:bg-black/60 sm:hidden"
        onClose={() => {
          setOpen(false);
          if (triggerRef.current?.getClientRects().length) triggerRef.current.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeNavigation();
        }}
      >
        <div className="h-full w-[calc(100%-3rem)] max-w-80 overflow-y-auto overscroll-contain border-r border-gray-800 bg-gray-950 px-4 pb-4">
          <div className="flex items-center justify-between gap-4 border-b border-gray-800 py-2">
            <h2 id={`${dialogId}-title`} className="text-base font-semibold">Navigation</h2>
            <button type="button" aria-label="Close navigation" className={iconButtonClass} onClick={closeNavigation}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav aria-label="Main navigation" className="grid gap-1 py-3">
            {links.map(({ label, href, ariaCurrent }) => (
              <Link
                key={href}
                href={href}
                prefetch={ariaCurrent !== "page"}
                transitionTypes={["main-navigation"]}
                aria-current={ariaCurrent}
                onNavigate={closeNavigation}
                className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-400 ${ariaCurrent ? "bg-red-500/15 text-red-300" : "text-gray-200 hover:bg-gray-800"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </dialog>
    </>
  );
}
