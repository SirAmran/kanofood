"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Toasts.
 *
 * For the outcome of a write: an order was cancelled, a rider was suspended, a
 * menu item was saved. Never for a read that failed, which belongs inline where
 * the missing content would have been, and never for anything that needs a
 * decision, which belongs in a dialog.
 *
 * The container is `aria-live="polite"` so a screen reader announces the result
 * of an action without interrupting what the operator is in the middle of.
 */

export interface Toast {
  readonly id: string;
  readonly message: string;
  readonly tone?: "neutral" | "danger";
}

interface ToastContextValue {
  readonly push: (message: string, tone?: Toast["tone"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Queue a toast. Returns null outside a provider rather than throwing, so a
 * component can be rendered in isolation, in a test or a story, without one.
 */
export function useToast(): ToastContextValue | null {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Toast["tone"] = "neutral") => {
      nextId.current += 1;
      const id = `toast-${nextId.current}`;
      // An error stays longer, because it is read more slowly and is the one a
      // person may need to act on.
      const duration = tone === "danger" ? 8000 : 4000;

      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="kf-toaster" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={cn("kf-toast", toast.tone === "danger" && "kf-toast--danger")}>
            <span>{toast.message}</span>
            <button
              type="button"
              className="kf-toast__action"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
