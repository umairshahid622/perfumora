"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { useSoundCue } from "../../_hooks/useSoundCue";

interface RippleButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  /** Opt out of the shared click cue — for the CTAs inside the navigation
   *  panels (cart, auth), which the sound spec excludes. */
  silent?: boolean;
  "aria-label"?: string;
}

const EXPAND_DURATION = 0.55;
const COLLAPSE_DURATION = 0.4;
const LABEL_DURATION = 0.22;

/**
 * The label waits for the fill to reach it rather than flipping with it: entering
 * at an edge, the circle needs about a fifth of its expansion to cover the
 * centre, and a label that changes colour before then spends a moment in the
 * fill's colour on top of the fill's colour.
 */
const LABEL_DELAY = 0.12;

/**
 * The shared CTA (§3.3 / §4.1): solid `--accent` fill with a label in
 * `--accent-contrast` (computed per variant, never hardcoded white). On hover the
 * contrast colour expands as a circle from wherever the cursor entered and the
 * label inverts to `--accent` as the circle reaches it — GSAP, not CSS
 * transitions (§1) — then collapses back toward wherever the cursor left.
 * Inverting the button's own two roles rather than introducing a third colour
 * keeps the label legible on every variant by construction: `--accent-contrast`
 * *is* the readable pairing for `--accent`. Motion is skipped under
 * `prefers-reduced-motion` (§2.7); the button still works, it just stays flat.
 */
export function RippleButton({
  children,
  onClick,
  type = "button",
  className,
  silent = false,
  ...rest
}: RippleButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const restingColor = useRef("");

  // The shared interaction cue (§1). `silent` opts the nav-panel CTAs (cart,
  // auth) out — they simply skip `play()` — while every other CTA sounds from
  // one place.
  const { play } = useSoundCue();
  const handleClick = () => {
    if (!silent) play();
    onClick?.();
  };

  // No `useGSAP` here: every tween targets a child of this button and is created
  // by a DOM event, so it dies with the element it animates — there is nothing
  // for a context to revert that unmounting does not already take care of.
  const handleEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    const fill = fillRef.current;
    const label = labelRef.current;
    if (!el || !fill || !label || prefersReducedMotion()) return;

    // Take the resting label colour from the element's own computed `color`,
    // with any inline colour a previous leave left behind cleared first, rather
    // than from `--accent-contrast`: the token holds `var(--ink)`/`var(--paper)`
    // per variant, while the computed value is that decision already resolved.
    gsap.set(label, { clearProps: "color" });
    restingColor.current = getComputedStyle(label).color;

    const rect = el.getBoundingClientRect();

    gsap.set(fill, {
      // Radius = the button's diagonal, so the circle reaches every corner from
      // any point inside it. That is also what lets the leave handler re-centre
      // it on the exit point without a visible jump: at full scale it still
      // covers the button from there.
      width: Math.hypot(rect.width, rect.height) * 2,
      height: Math.hypot(rect.width, rect.height) * 2,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      xPercent: -50,
      yPercent: -50,
      scale: 0,
    });

    gsap.to(fill, {
      scale: 1,
      duration: EXPAND_DURATION,
      ease: "power2.out",
      overwrite: true,
    });

    gsap.to(label, {
      // `--accent` is written as a literal hex, so it needs no resolving.
      color: getComputedStyle(el).getPropertyValue("--accent").trim(),
      duration: LABEL_DURATION,
      delay: LABEL_DELAY,
      ease: "power2.out",
      overwrite: true,
    });
  };

  const handleLeave = (event: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    const fill = fillRef.current;
    const label = labelRef.current;
    if (!el || !fill || !label || prefersReducedMotion()) return;

    const rect = el.getBoundingClientRect();
    gsap.set(fill, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });

    gsap.to(fill, {
      scale: 0,
      duration: COLLAPSE_DURATION,
      ease: "power2.in",
      overwrite: true,
    });

    gsap.to(label, {
      color: restingColor.current,
      duration: LABEL_DURATION,
      ease: "power2.out",
      overwrite: true,
      // Hand the colour back to `text-accent-contrast` once it matches again,
      // so the label follows the token the next time the variant changes
      // instead of holding the previous variant's contrast inline.
      onComplete: () => gsap.set(label, { clearProps: "color" }),
    });
  };

  return (
    <button
      ref={ref}
      type={type}
      onClick={handleClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={cn(
        // `ring-accent` is invisible at rest — it sits on a fill of the same
        // colour — and costs nothing until the fill changes under it. It earns its
        // keep on hover: `--accent-contrast` resolves to `--paper`, which is the
        // *same hex* as `--bg-light`, so a flooded button would otherwise dissolve
        // into the page and leave the label floating. The ring keeps the
        // silhouette, turning the hover into filled → outlined.
        "bg-accent text-accent-contrast ring-1 ring-accent relative inline-flex items-center justify-center overflow-hidden rounded-full",
        "px-9 py-4 text-[0.8rem] font-semibold uppercase tracking-widest",
        "cursor-pointer select-none",
        className,
      )}
      {...rest}
    >
      {/* Sized and positioned per hover, so it starts life 0×0 and nothing is
          painted before the first cursor enters — including in the SSR HTML. */}
      <span
        ref={fillRef}
        aria-hidden="true"
        className="bg-accent-contrast pointer-events-none absolute top-0 left-0 rounded-full will-change-transform"
      />
      <span ref={labelRef} className="relative">
        {children}
      </span>
    </button>
  );
}
