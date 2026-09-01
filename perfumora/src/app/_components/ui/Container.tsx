import type { ReactNode } from "react";
import { cn } from "../../_lib/cn";

/**
 * Horizontal rhythm primitive (§3.4): centres content and applies the shared
 * gutter that every section aligns to. No vertical spacing — that belongs to
 * <Section> — so a Container can nest without stacking padding.
 */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[110rem] px-6 md:px-16", className)}>
      {children}
    </div>
  );
}
