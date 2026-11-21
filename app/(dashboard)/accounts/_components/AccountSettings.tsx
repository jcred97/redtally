"use client";

import { useEffect, useId, useRef, useState } from "react";
import FormDialog from "@/app/components/dialogs/FormDialog";
import TextInput from "@/app/components/forms/TextInput";
import { fieldLabelClass } from "@/app/components/forms/field-styles";
import styles from "@/app/components/menus/action-menu.module.css";
import { useActionMenuKeyboard } from "@/app/components/menus/useActionMenuKeyboard";
import { deleteFinancialAccount, renameFinancialAccount } from "../_lib/mutations";

const menuItemClass =
  `${styles.item} flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm font-medium`;

const iconPaths = {
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l.5 2.3 1.8 1 2.2-.7 2 3.4-1.7 1.6v2.8l1.7 1.6-2 3.4-2.2-.7-1.8 1-.5 2.3h-4l-.5-2.3-1.8-1-2.2.7-2-3.4 1.7-1.6V9l-1.7-1.6 2-3.4 2.2.7 1.8-1L10 3Z",
  edit: "m14.5 6.5 3 3M4 20l4-.8L20 7.2a2.1 2.1 0 0 0-3-3L5 16l-1 4Z",
  delete: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5",
};

function SettingsIcon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
      <path d={iconPaths[name]} />
    </svg>
  );
}

export default function AccountSettings({ account }: { account: { id: string; name: string } }) {
  const settingsId = useId();
  const panelId = useId();
  const nameId = useId();
  const settingsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const handleMenuKeyDown = useActionMenuKeyboard({ open, setOpen, triggerRef, panelRef });

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  async function remove() {
    const result = await deleteFinancialAccount(account.id);
    if ("success" in result) {
      requestAnimationFrame(() => document.getElementById("accounts-title")?.focus());
    }
    return result;
  }

  return (
    <div ref={settingsRef} className="relative"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={handleMenuKeyDown}>
      <button
        id={settingsId}
        ref={triggerRef}
        type="button"
        aria-label={`Settings for ${account.name}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`${styles.trigger} flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-gray-800 hover:text-white`}
      >
        <SettingsIcon name="settings" />
      </button>

      <div id={panelId} ref={panelRef} hidden={!open}
        className={`${styles.panel} absolute top-full right-0 z-10 mt-2 w-52 max-w-[calc(100vw-3rem)] p-1 text-gray-200`}>
        <FormDialog
          triggerLabel={<><SettingsIcon name="edit" />Edit Name</>}
          triggerClassName={menuItemClass}
          returnFocusId={settingsId}
          title="Edit account name"
          onOpenAction={() => setOpen(false)}
          submitLabel="Save name"
          pendingLabel="Saving…"
          failureMessage="Unable to rename the account. Please try again."
          submitAction={(formData) => renameFinancialAccount(account.id, formData)}
        >
          <div>
            <label htmlFor={nameId} className={fieldLabelClass}>Name</label>
            <TextInput id={nameId} name="name" defaultValue={account.name} required maxLength={120} />
          </div>
        </FormDialog>
        <FormDialog
          triggerLabel={<><SettingsIcon name="delete" />Delete Account</>}
          triggerClassName={`${menuItemClass} text-red-400`}
          destructive
          returnFocusId={settingsId}
          title="Delete account?"
          description="This permanently removes the account and its expense group settings."
          onOpenAction={() => setOpen(false)}
          submitLabel="Delete account"
          pendingLabel="Deleting…"
          failureMessage="Unable to delete the account. Please try again."
          submitAction={remove}
        >
          <p className="wrap-anywhere font-medium">{account.name}</p>
        </FormDialog>
      </div>
    </div>
  );
}
