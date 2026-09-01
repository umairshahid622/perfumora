"use client";

import type { ReactNode } from "react";
import { RippleButton } from "./RippleButton";
import { scrollToSection } from "../../_lib/scroll-to";
import type { SectionId } from "../../_lib/sections";

/**
 * A <RippleButton> that smooth-scrolls to an in-page section via GSAP's
 * ScrollToPlugin (§2.9) — the target is always a section id on this one route,
 * never a Next.js route. Lets server-rendered sections (e.g. the closing CTA)
 * carry a working call-to-action without becoming client components themselves.
 */
export function ScrollButton({
  to,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  to: SectionId;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <RippleButton
      onClick={() => scrollToSection(to)}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </RippleButton>
  );
}
