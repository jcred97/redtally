"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import menuStyles from "@/app/components/menus/action-menu.module.css";

const dialogWidths = {
  default: "max-w-md",
  wide: "max-w-3xl",
  "extra-wide": "max-w-3xl lg:max-w-6xl",
};

const actionSize = "min-h-10 rounded-lg px-4 text-sm font-medium";
const primaryAction = `${actionSize} cursor-pointer bg-red-500 text-white transition-colors enabled:hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50`;
const secondaryAction = `${actionSize} button-secondary`;

type FormDialogProps = {
  triggerLabel: ReactNode;
  triggerAriaLabel?: string;
  triggerFocusKey?: string;
  triggerVariant?: "primary" | "secondary" | "danger" | "menu";
  triggerClassName?: string;
  destructive?: boolean;
  returnFocusId?: string;
  successFocusId?: string;
  title: string;
  description?: string;
  dialogSize?: keyof typeof dialogWidths;
  compact?: boolean;
  children: ReactNode;
  onOpenAction: () => void;
  disabled?: boolean;
  submitDisabled?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  pendingMessage?: string;
  failureMessage: string;
  submitAction: (
    formData: FormData
  ) => Promise<{ error: string } | { success: true } | null>;
};

export default function FormDialog({
  triggerLabel,
  triggerAriaLabel,
  triggerFocusKey,
  triggerVariant = "primary",
  triggerClassName,
  destructive = false,
  returnFocusId,
  successFocusId,
  title,
  description,
  dialogSize = "default",
  compact = false,
  children,
  onOpenAction,
  disabled = false,
  submitDisabled = false,
  submitLabel = "Create",
  pendingLabel = "Creating...",
  pendingMessage,
  failureMessage,
  submitAction,
}: FormDialogProps) {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusOnCloseId = useRef<string | undefined>(undefined);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startSaving] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    dialog?.showModal();

    return () => {
      dialog?.close();
      // Deleting an item also removes its trigger. Focus the surviving list heading.
      if (returnFocusId) {
        queueMicrotask(() => {
          if (!trigger?.isConnected) {
            document.getElementById(returnFocusId)?.focus();
          }
        });
      }
    };
  }, [open, returnFocusId]);

  function openDialog() {
    if (disabled || submitting.current || pending || open) {
      return;
    }

    onOpenAction();
    focusOnCloseId.current = undefined;
    setError("");
    setOpen(true);
  }

  function closeDialog() {
    if (submitting.current || pending) {
      return;
    }

    dialogRef.current?.close();
  }

  function restoreTriggerFocus() {
    const focusId = focusOnCloseId.current;
    const focusTarget = focusId ? document.getElementById(focusId) : null;
    if (focusTarget) {
      focusTarget.focus();
      return;
    }

    const trigger = triggerRef.current;

    if (trigger?.getClientRects().length) {
      trigger.focus();
      return;
    }

    // A responsive layout or closed popover may have hidden the original trigger.
    if (triggerFocusKey) {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        "button[data-dialog-focus-key]"
      );
      const visibleTrigger = Array.from(buttons).find(
        (button) =>
          button.dataset.dialogFocusKey?.split(" ").includes(triggerFocusKey) &&
          button.getClientRects().length > 0
      );
      if (visibleTrigger) {
        visibleTrigger.focus();
        return;
      }
    }

    if (returnFocusId) {
      document.getElementById(returnFocusId)?.focus();
    }
  }

  function handleClose() {
    setOpen(false);
    restoreTriggerFocus();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside) {
      closeDialog();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || submitDisabled || submitting.current || pending) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    submitting.current = true;
    setError("");

    startSaving(async () => {
      try {
        const result = await submitAction(formData);

        if (result && "error" in result) {
          setError(result.error);
        } else if (result && "success" in result) {
          focusOnCloseId.current = successFocusId;
          dialogRef.current?.close();
          // A server refresh can replace the dialog before its native close event arrives.
          handleClose();
        }
      } catch {
        setError(failureMessage);
      } finally {
        submitting.current = false;
      }
    });
  }

  let triggerClass = `${primaryAction} flex items-center gap-1.5 py-2`;

  if (triggerVariant === "secondary") {
    triggerClass = `${secondaryAction} py-2`;
  }

  if (triggerVariant === "danger") {
    triggerClass = `${actionSize} cursor-pointer border border-red-500/30 py-2 text-red-400 transition-colors enabled:hover:border-red-400 enabled:hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50`;
  }

  if (triggerVariant === "menu") {
    triggerClass =
      `${menuStyles.item} flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-200`;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerAriaLabel}
        data-dialog-focus-key={triggerFocusKey}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={openDialog}
        disabled={disabled}
        className={triggerClassName ?? triggerClass}
      >
        {triggerLabel}
      </button>

      {open &&
        createPortal(
          <dialog
            ref={dialogRef}
            id={dialogId}
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={description ? `${dialogId}-description` : undefined}
            onCancel={(event) => {
              if (submitting.current || pending) {
                event.preventDefault();
              }
            }}
            onClose={handleClose}
            onClick={handleBackdropClick}
            className={`m-auto rounded-xl border border-gray-800 bg-gray-900 text-white backdrop:bg-black/60 ${dialogWidths[dialogSize]} ${compact ? "max-h-[calc(100dvh-0.5rem)] w-[calc(100%-1rem)] flex-col overflow-hidden p-2 open:flex sm:max-h-[calc(100dvh-1rem)] sm:p-5" : "max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto p-6"}`}
          >
            <h2
              id={`${dialogId}-title`}
              className={`shrink-0 text-lg font-semibold text-white ${description ? "mb-1" : compact ? "mb-1 sm:mb-3" : "mb-3"}`}
            >
              {title}
            </h2>
            {description && (
              <p id={`${dialogId}-description`} className={`shrink-0 text-sm text-gray-400 ${compact ? "mb-3" : "mb-5"}`}>
                {description}
              </p>
            )}

            <form
              onSubmit={handleSubmit}
              className={compact ? "flex min-h-0 flex-col" : undefined}
              aria-busy={pending}
              aria-describedby={error ? `${dialogId}-error` : undefined}
            >
              <div className={compact ? "mb-1.5 min-h-0 overflow-y-auto sm:mb-3" : "mb-4"}>
                <fieldset disabled={pending} className={compact ? "min-w-0 space-y-4" : "space-y-4"}>
                  {children}
                </fieldset>
              </div>

              {error && (
                <p
                  id={`${dialogId}-error`}
                  role="alert"
                  className="text-red-400 text-sm mb-4"
                >
                  {error}
                </p>
              )}

              <div className="flex shrink-0 justify-end gap-3">
                <button
                  type="button"
                  autoFocus={destructive}
                  onClick={closeDialog}
                  disabled={pending}
                  className={`${secondaryAction} py-2`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || submitDisabled}
                  className={`${primaryAction} py-2`}
                >
                  {pending ? pendingLabel : submitLabel}
                </button>
              </div>
            </form>

            <p role="status" className={pending && pendingMessage ? "mt-3 text-sm text-gray-400" : "sr-only"}>
              {pending ? (pendingMessage ?? pendingLabel) : null}
            </p>
          </dialog>,
          document.body
        )}
    </>
  );
}
