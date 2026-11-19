"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { fieldClass } from "./field-styles";
import styles from "./select.module.css";

type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectProps = {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string) => void;
  options: readonly SelectOption[];
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

export default function Select({
  id, name, value: controlledValue, defaultValue, onChange, options, required, disabled, className = "",
  "aria-describedby": describedBy, ...aria
}: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const listId = `${fieldId}-options`;
  const errorId = `${fieldId}-error`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const initialValue = String(defaultValue ?? options[0]?.value ?? "");
  const [localValue, setLocalValue] = useState(initialValue);
  const value = controlledValue === undefined ? localValue : String(controlledValue);
  const selected = options.findIndex((option) => option.value === value);
  const firstEnabled = options.findIndex((option) => !option.disabled);
  const defaultActive = selected >= 0 && !options[selected].disabled ? selected : firstEnabled;
  const activeMatch = options.findIndex((option) => option.value === activeValue && !option.disabled);
  const active = activeMatch < 0 ? defaultActive : activeMatch;
  const activeOption = options[active];
  const showError = invalid && !value && !disabled;

  useLayoutEffect(() => {
    const form = trigger.current?.form;
    if (!form) return;
    function reset() {
      setLocalValue(initialValue);
      setInvalid(false);
      setOpen(false);
    }
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [initialValue]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = list.current!;
    const button = trigger.current!;
    // A popover stays above the modal dialog and escapes its scrolling container.
    function position() {
      const bounds = button.getBoundingClientRect();
      const below = window.innerHeight - bounds.bottom - 12;
      const above = bounds.top - 12;
      const upwards = below < Math.min(menu.scrollHeight, 240) && above > below;
      menu.style.width = `${Math.min(bounds.width, window.innerWidth - 16)}px`;
      menu.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - bounds.width - 8))}px`;
      menu.style.maxHeight = `${Math.max(0, Math.min(240, upwards ? above : below))}px`;
      menu.style.top = upwards ? "auto" : `${bounds.bottom + 4}px`;
      menu.style.bottom = upwards ? `${window.innerHeight - bounds.top + 4}px` : "auto";
    }
    menu.showPopover();
    position();
    function dismiss(event: PointerEvent) {
      if (!menu.contains(event.target as Node) && !button.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      menu.hidePopover();
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, open, listId]);

  function openMenu() {
    if (trigger.current?.matches(":disabled")) return;
    search.current = { text: "", time: 0 };
    setActiveValue(options[defaultActive]?.value);
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (option && !option.disabled && !trigger.current?.matches(":disabled")) {
      setLocalValue(option.value);
      setInvalid(false);
      onChange?.(option.value);
    }
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (open && event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      commit(active);
      return;
    }
    if (event.key === "Tab") {
      if (open) commit(active);
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (["Enter", " "].includes(event.key) && (!search.current.text || Date.now() - search.current.time >= 700 || event.key === "Enter")) {
      event.preventDefault();
      if (open) commit(active); else openMenu();
      return;
    }
    const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) openMenu();
      const current = enabled.indexOf(open ? active : selected);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
        : Math.max(0, Math.min(enabled.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
      setActiveValue(options[enabled[next]]?.value);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!open) openMenu();
      const now = Date.now();
      const text = (now - search.current.time < 700 ? search.current.text : "") + event.key.toLocaleLowerCase();
      search.current = { text, time: now };
      const query = [...text].every((letter) => letter === text[0]) ? text[0] : text;
      const start = open ? active : selected;
      for (let offset = 1; offset <= options.length; offset++) {
        const index = (Math.max(start, -1) + offset) % options.length;
        if (!options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(query)) {
          setActiveValue(options[index].value);
          break;
        }
      }
    }
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      {required && (
        // Keep native form validation, but send users to the visible control to make a choice.
        <input className={styles.visuallyHidden} type="text" required value={value}
          onChange={() => {}} tabIndex={-1} aria-hidden="true" disabled={disabled} onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            const firstInvalid = event.currentTarget.form?.querySelector(":invalid:not(fieldset)");
            if (firstInvalid === event.currentTarget) {
              trigger.current?.focus();
              openMenu();
            }
          }} />
      )}
      <button {...aria} ref={trigger} id={fieldId} type="button" role="combobox"
        aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open && activeOption ? `${listId}-${active}` : undefined}
        aria-required={required || undefined} aria-invalid={showError || undefined}
        aria-describedby={showError ? [describedBy, errorId].filter(Boolean).join(" ") : describedBy}
        disabled={disabled} className={`${fieldClass} ${styles.trigger} ${className}`}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown} onBlur={() => setOpen(false)}>
        {options[selected]?.label ?? ""}
      </button>
      {showError && <span id={errorId} role="alert" className={styles.visuallyHidden}>Select an option.</span>}
      <div ref={list} id={listId} popover="manual" role="listbox"
        aria-labelledby={aria["aria-labelledby"]} aria-label={aria["aria-label"] ?? "Options"} className={styles.menu}
        onPointerDown={(event) => event.preventDefault()}>
        {options.map((option, index) => (
          <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value}
            aria-disabled={option.disabled || undefined} data-active={index === active}
            className={styles.option} onPointerMove={(event) => {
              if (event.pointerType === "mouse" && !option.disabled) setActiveValue(option.value);
            }}
            onClick={() => { if (!option.disabled) commit(index); }}>
            <span>{option.label}</span><span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}
