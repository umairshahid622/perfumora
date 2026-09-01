import type { ReactNode } from "react";
import { cn } from "../../_lib/cn";
import type { SectionId } from "../../_lib/sections";

export type Tone = "light" | "dark";

interface SectionProps {
  id: SectionId;
  /** Light = parchment bg / ink text; dark = near-black bg / paper text (§3.3). */
  tone?: Tone;
  /**
   * How the full-height beat lays out its child. `full` (the Hero) hands the
   * child a bare flex column to fill on its own; the default centres the section's
   * content within the screen.
   */
  full?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * One scrollable beat of the page (§3.4 / §4). Owns its own background + default
 * text colour from the two-tone system and its vertical rhythm, and stamps
 * `data-tone` so the nav can read which tone sits behind it and swap its own
 * colour to match (§4.0).
 *
 * Every beat fills the viewport (`min-h-screen`) so the page reads one section at
 * a time. `full` lets the child own that height (the Hero's stage does); the
 * default vertically centres the content within the screen.
 */
export function Section({
  id,
  tone = "light",
  full = false,
  className,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      data-tone={tone}
      className={cn(
        "relative w-full overflow-hidden",
        tone === "light" ? "bg-bg-light text-ink" : "bg-bg-dark text-paper",
        full
          ? "flex min-h-screen flex-col"
          : "flex min-h-screen flex-col justify-center py-20 md:py-24",
        className,
      )}
    >
      {children}
    </section>
  );
}
