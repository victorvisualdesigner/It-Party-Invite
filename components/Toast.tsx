"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastAction = { label: string; href?: string; run?: () => void };
type ToastItem = { id: number; message: string; action?: ToastAction };

const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/** One toast at a time at the bottom of the screen, announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const node = useRef<HTMLDivElement>(null);

  const show = useCallback((message: string, action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setItem({ id: Date.now(), message, action });
    timer.current = setTimeout(() => setItem(null), action ? 6500 : 2800);
  }, []);

  useEffect(() => {
    if (!item || !node.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.current.animate(
      [
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  }, [item]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {item ? (
          <div className="toast" key={item.id} ref={node}>
            <span>{item.message}</span>
            {item.action?.href ? (
              <a className="btn btn-gold" href={item.action.href} target="_blank" rel="noopener noreferrer" onClick={() => setItem(null)}>
                {item.action.label}
              </a>
            ) : item.action ? (
              <button
                className="btn btn-gold"
                type="button"
                onClick={() => {
                  item.action?.run?.();
                  setItem(null);
                }}
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
