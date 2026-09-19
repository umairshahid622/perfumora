import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/* Accessible modal: portal to document.body so it floats cleanly in front of
   the sidebar and page shell, backdrop click + Escape close, body scroll lock,
   and subtle scale-in. */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional footer (action buttons). */
  footer?: ReactNode;
  /** Tailwind max-width class for the panel. */
  maxWidth?: string;
  /** Optional custom body styling */
  bodyClassName?: string;
  /** Custom z-index class (defaults to z-[100] to sit above sidebar z-40) */
  zIndex?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-lg",
  bodyClassName = "px-6 py-5",
  zIndex = "z-[100]",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      // Only restore scroll if no other modals remain open
      const remainingModals = document.querySelectorAll("[role='dialog']").length;
      if (remainingModals <= 1) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 ${zIndex} flex items-start justify-center overflow-y-auto p-4 sm:p-6`}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 my-4 sm:my-8 flex max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-scale-in`}
      >
        {/* 1. Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 bg-white">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {/* 2. Editor / Content */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>
          {children}
        </div>

        {/* 3. Footer */}
        {footer && (
          <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
