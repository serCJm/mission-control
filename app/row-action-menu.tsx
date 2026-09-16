"use client";

import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { Presence } from "./presence";

export function RowActionMenu({ title, vertical = false, buttonRef, children }: { title: string; vertical?: boolean; buttonRef?: RefObject<HTMLButtonElement | null>; children: (choose: (action: () => void, restoreFocus?: boolean) => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const localTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = buttonRef ?? localTriggerRef;
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      const trigger = triggerRef.current;
      if (!menu || !trigger) return;
      const boundary = trigger.closest(".planner-workbench")?.getBoundingClientRect();
      const anchor = trigger.getBoundingClientRect();
      const below = Math.min(window.innerHeight, boundary?.bottom ?? window.innerHeight) - anchor.bottom;
      const above = anchor.top - Math.max(0, boundary?.top ?? 0);
      const opensAbove = below < menu.offsetHeight + 9 && above > below;
      menu.style.top = opensAbove ? "auto" : "calc(100% + 5px)";
      menu.style.bottom = opensAbove ? "calc(100% + 5px)" : "auto";
      menu.style.maxHeight = `${Math.max(44, (opensAbove ? above : below) - 9)}px`;
      menu.style.overflowY = "auto";
      menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    function closeOnOutsideClick(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, triggerRef]);

  function choose(action: () => void, restoreFocus = true) {
    const queueTabs = triggerRef.current?.closest(".block-project-work")?.querySelector<HTMLButtonElement>('.planner-queue-tabs button[aria-pressed="true"]');
    setOpen(false);
    action();
    if (restoreFocus) window.requestAnimationFrame(() => (triggerRef.current ?? queueTabs)?.focus());
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else if (currentIndex < 0) nextIndex = event.key === "ArrowUp" ? buttons.length - 1 : 0;
    else nextIndex = event.key === "ArrowDown" ? (currentIndex + 1) % buttons.length : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[nextIndex].focus();
  }

  return <div className="planner-row-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={triggerRef} type="button" className="planner-icon-action" aria-expanded={open} aria-controls={menuId} aria-haspopup="menu" aria-label={`More actions for ${title}`} title="More actions" onClick={() => setOpen((current) => !current)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d={vertical ? "M10 5h.01M10 10h.01M10 15h.01" : "M5 10h.01M10 10h.01M15 10h.01"} /></svg></button>
    <Presence show={open} className="motion-popover">{() => <div ref={menuRef} id={menuId} className="planner-row-menu-popover" role="menu" tabIndex={-1} aria-label={`More actions for ${title}`} onKeyDown={handleMenuKeyDown}>{children(choose)}</div>}</Presence>
  </div>;
}

export function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 3.7 3.7L16 5.8" /></svg>;
}

export function DeleteIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M7 5.5V3.3h6v2.2m2 0-.8 11.2H5.8L5 5.5m3 3v5m4-5v5" /></svg>;
}

export function ReopenIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h8a5 5 0 0 1 0 10M3 8l4-4M3 8l4 4" /></svg>;
}

export function WaitIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5v4l2.6 1.5" /></svg>;
}
