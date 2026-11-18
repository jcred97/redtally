import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";

type ActionMenuKeyboardOptions = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
};

function enabledItems(panel: HTMLDivElement | null) {
  return Array.from(panel?.querySelectorAll<HTMLElement>("a[href], button") ?? []).filter(
    (item) => item.tabIndex >= 0 && !item.matches(':disabled, [aria-disabled="true"]')
      && !item.closest("[inert]") && item.getClientRects().length > 0,
  );
}

export function useActionMenuKeyboard({ open, setOpen, triggerRef, panelRef }: ActionMenuKeyboardOptions) {
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  const search = useRef({ text: "", time: 0 });

  useLayoutEffect(() => {
    search.current = { text: "", time: 0 };
    if (open && focusOnOpen.current) {
      const items = enabledItems(panelRef.current);
      items.at(focusOnOpen.current === "first" ? 0 : -1)?.focus();
      focusOnOpen.current = null;
    }
  }, [open, panelRef]);

  return function handleKeyDown(event: KeyboardEvent) {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    const onTrigger = event.target === trigger;
    // Dialogs rendered through a React portal can bubble events to a menu.
    if (event.defaultPrevented || (!onTrigger && !panel?.contains(event.target as Node))) return;

    const { key } = event;
    if (open && key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger?.focus({ preventScroll: true });
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!open) {
      if (onTrigger && (key === "ArrowDown" || key === "ArrowUp")) {
        event.preventDefault();
        focusOnOpen.current = key === "ArrowDown" ? "first" : "last";
        setOpen(true);
      }
      return;
    }

    const items = enabledItems(panel);
    const current = items.findIndex((item) => item === event.target);
    if (key === "Home" || key === "End" || key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      let next = 0;
      if (key === "End" || (key === "ArrowUp" && current < 0)) next = items.length - 1;
      if (key === "ArrowUp" && current >= 0) next = Math.max(0, current - 1);
      if (key === "ArrowDown") next = Math.min(items.length - 1, current + 1);
      items[next]?.focus();
      return;
    }

    if (key === " " && items[current] instanceof HTMLAnchorElement) {
      event.preventDefault();
      items[current].click();
      return;
    }

    if (key.length !== 1 || key === " " || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const now = Date.now();
    const text = (now - search.current.time < 700 ? search.current.text : "") + key.toLocaleLowerCase();
    search.current = { text, time: now };
    const query = Array.from(text).every((letter) => letter === text[0]) ? text[0] : text;
    const item = [...items.slice(current + 1), ...items.slice(0, current + 1)].find((item) => {
      const label = item.getAttribute("aria-label") ?? item.innerText;
      return label.replace(/^[\s✓]+/, "").toLocaleLowerCase().startsWith(query);
    });
    item?.focus();
  };
}
