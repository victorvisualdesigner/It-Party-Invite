"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Centered dialog on a scrim, as in the design build. Escape and the scrim close it. Focus stays inside. */
export function Dialog({
  labelledBy,
  onClose,
  children,
  surface = "surface-paper",
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  surface?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = panel.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>("input, select, textarea, [data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.animate(
        [
          { opacity: 0, transform: "translateY(10px) scale(.98)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" },
      );
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={`overlay center ${surface}`}>
      <div className="scrim" onClick={() => closeRef.current()} />
      <div ref={panel} className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
