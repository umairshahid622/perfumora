import type { ReactNode } from "react";
import { cn } from "../../_lib/cn";
import type { Tone } from "./Section";

/**
 * A micro-label / eyebrow (§3.2): Switzer 500, all-caps, wide tracking, always
 * in the muted token for its tone — never full-contrast, never the accent
 * (accent is reserved for price, CTA, live product colour and glow, §3.3).
 */
export function Eyebrow({
  children,
  tone = "light",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-micro block font-medium uppercase",
        tone === "light" ? "text-muted-on-light" : "text-muted-on-dark",
        className,
      )}
    >
      {children}
    </span>
  );
}
