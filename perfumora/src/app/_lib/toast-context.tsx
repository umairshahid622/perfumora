"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export interface ToastItem {
  id: string;
  message: string;
  type?: "info" | "warning" | "error";
}

interface ToastContextValue {
  showToast: (message: string, type?: "info" | "warning" | "error") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const showToast = useCallback(
    (message: string, type: "info" | "warning" | "error" = "warning") => {
      setToasts((prev) => {
        const existing = prev.find((t) => t.message === message);
        const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        // Clear existing timer if toast is already visible
        if (existing) {
          const oldTimer = timersRef.current.get(existing.id);
          if (oldTimer) {
            clearTimeout(oldTimer);
            timersRef.current.delete(existing.id);
          }
        }

        // Set fresh auto-dismiss timer
        const timer = setTimeout(() => {
          dismissToast(newId);
        }, 3500);
        timersRef.current.set(newId, timer);

        // If duplicate message exists, refresh in place without stacking a second card
        if (existing) {
          return prev.map((t) =>
            t.message === message ? { ...t, id: newId, type } : t,
          );
        }

        // Otherwise append, keeping at most 2 distinct toast notifications
        return [...prev.slice(-1), { id: newId, message, type }];
      });
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Overlay Container */}
      <aside
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed top-6 right-0 left-0 z-[120] flex flex-col items-center gap-2.5 px-4 sm:top-8"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-3 rounded-full px-5 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-300",
              item.type === "warning" || item.type === "error"
                ? "border border-amber-500/30 bg-[#1b1712]/95 text-[#f3ece0]"
                : "border border-white/10 bg-[#1b1712]/95 text-[#f3ece0]",
            )}
          >
            {/* Warning pulse dot */}
            <span
              className="flex size-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
              aria-hidden="true"
            />
            <p className="text-xs sm:text-sm font-medium tracking-tight">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label="Close notification"
              className="hover:text-amber-400 -mr-1 ml-2 grid size-5 place-items-center text-xs font-semibold text-white/50 transition-colors"
            >
              ✕
            </button>
          </div>
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}
