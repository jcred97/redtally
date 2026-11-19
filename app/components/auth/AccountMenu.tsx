"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { authClient } from "@/app/lib/auth/client";
import LoadingScreen from "@/app/components/feedback/LoadingScreen";
import styles from "@/app/components/menus/action-menu.module.css";
import { useActionMenuKeyboard } from "@/app/components/menus/useActionMenuKeyboard";
import AccountAvatar from "./AccountAvatar";

export default function AccountMenu({ name, email, image }: { name: string; email: string; image?: string | null }) {
  const router = useRouter();
  const panelId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [redirecting, startNavigation] = useTransition();
  const [error, setError] = useState("");
  const pending = authPending || redirecting;
  const handleMenuKey = useActionMenuKeyboard({ open, setOpen: changeOpen, triggerRef, panelRef });

  const displayName = name.trim();

  useEffect(() => {
    if (!open || pending) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open, pending]);

  useEffect(() => {
    if (open && !pending && error) signOutRef.current?.focus();
  }, [open, pending, error]);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setError("");
    setOpen(nextOpen);
  }

  async function signOut() {
    if (submitting.current || pending) return;

    submitting.current = true;
    setAuthPending(true);
    setError("");

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setError("Unable to sign out. Please try again.");
        return;
      }

      // Keep loading visible while the sign-in page is being loaded.
      startNavigation(() => {
        router.replace("/sign-in");
        router.refresh();
      });
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      submitting.current = false;
      setAuthPending(false);
    }
  }

  return (
    <>
      <div
        ref={menuRef}
        className="relative shrink-0"
        inert={pending}
        aria-hidden={pending}
        onBlur={(event) => {
          if (!submitting.current && !pending && !event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
        onKeyDown={pending ? undefined : handleMenuKey}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label="Account menu"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => changeOpen(!open)}
          className={`${styles.trigger} flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-500`}
        >
          <AccountAvatar name={name} email={email} image={image} />
        </button>

        <div
          ref={panelRef}
          id={panelId}
          hidden={!open}
          className={`${styles.panel} absolute top-full right-0 z-20 mt-2 w-64 max-w-[calc(100vw-3rem)] overflow-hidden`}
        >
          <div className="border-b border-gray-800 px-4 py-3">
            <p className="truncate text-sm font-semibold text-white" title={displayName || email}>
              {displayName || email}
            </p>
            {displayName && (
              <p className="truncate text-xs text-gray-400" title={email}>
                {email}
              </p>
            )}
          </div>
          <div className="p-1">
            <Link
              href="/account-settings"
              onClick={() => changeOpen(false)}
              className={`${styles.item} block px-3 py-2 text-sm text-gray-300`}
            >
              Account settings
            </Link>
            <button
              ref={signOutRef}
              type="button"
              onClick={signOut}
              disabled={pending}
              className={`${styles.item} w-full cursor-pointer px-3 py-2 text-left text-sm text-gray-300 transition-colors disabled:opacity-60`}
            >
              {pending ? "Signing out..." : "Sign out"}
            </button>
            {error && (
              <p role="alert" className="px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {pending && <LoadingScreen message="Signing out..." />}
    </>
  );
}
