import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/* Labeled form controls with a shared look (used by auth pages + fragrance
   form). Native focus ring in the accent color. */

const fieldBase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-slate-700"
    >
      {children}
    </label>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Optional slot rendered on the left inside the input (e.g. an icon). */
  leading?: ReactNode;
  hint?: string;
}

export function TextField({ label, leading, hint, id, className, ...props }: FieldProps) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            {leading}
          </span>
        )}
        <input
          id={id}
          className={cn(fieldBase, "h-10", leading ? "pl-10" : undefined, className)}
          {...props}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextAreaField({ label, id, className, ...props }: TextAreaProps) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <textarea id={id} className={cn(fieldBase, "py-2", className)} {...props} />
    </div>
  );
}

interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function SelectField({ label, id, className, children, ...props }: SelectProps) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <select id={id} className={cn(fieldBase, "h-10 pr-8", className)} {...props}>
        {children}
      </select>
    </div>
  );
}
