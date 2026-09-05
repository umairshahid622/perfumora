"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../_lib/motion";
import { useScent } from "../../_lib/scent-context";

/**
 * The oversized fragrance name behind the bottle (§4.1), and its change
 * transition: stepping the variant re-letters the word, each glyph rising into
 * place a beat after the one before it, so a scent change reads as a
 * typographic event rather than a text swap.
 *
 * The word is split into glyphs here rather than with GSAP's SplitText — that is
 * a premium plugin and outside the allowed dependencies (§1). Purely decorative,
 * so it stays `aria-hidden`: the name is already announced by the product bar.
 */
export function FragranceName() {
  const { variant, index } = useScent();
  const scopeRef = useRef<HTMLSpanElement>(null);
  const firstRun = useRef(true);

  // Fit-to-width: size the wordmark by its length so it always spans roughly the
  // same fraction of the viewport instead of a fixed `vw`. A fixed size overflows
  // once a name gets long ("Imperial Vally"), so scale inversely with the glyph
  // count — the constant is the width budget (≈ one screen) ÷ average glyph
  // advance, capped so the shortest names don't balloon.
  const sizeVw = Math.min(22, 140 / variant.name.length);

  useGSAP(
    () => {
      // First paint and reduced motion both want the name simply *there*. That
      // has to mean no tween at all, not a zero-duration one: `fromTo` applies
      // its from-values immediately, and a zero-duration tween never renders an
      // end state to clear them — the word would stay parked 55% low.
      const snap = firstRun.current || prefersReducedMotion();
      firstRun.current = false;
      if (snap) return;

      gsap.fromTo(
        ".letter",
        { yPercent: 55, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.055,
          ease: "power3.out",
        },
      );
    },
    // `revertOnUpdate` so each change starts from a clean slate instead of
    // inheriting inline transforms from the step before it.
    { scope: scopeRef, dependencies: [index], revertOnUpdate: true },
  );

  return (
    <span
      ref={scopeRef}
      aria-hidden="true"
      style={{ fontSize: `${sizeVw.toFixed(1)}vw` }}
      className="font-display text-ink pointer-events-none absolute inset-0 flex select-none items-center justify-center leading-none uppercase opacity-[0.055] tracking-tight"
    >
      {/* One wrapper so the glyphs share a baseline — as individual flex items
          they would each be centred on their own box instead. */}
      <span className="whitespace-nowrap">
        {variant.name.split("").map((letter, i) => (
          // Keyed on the variant too, so every change mounts fresh spans and the
          // `fromTo` start state is never fighting a half-finished tween.
          <span key={`${index}-${i}`} className="letter inline-block">
            {/* A plain space collapses to zero width inside an inline-block,
                which would close up a two-word name. */}
            {letter === " " ? " " : letter}
          </span>
        ))}
      </span>
    </span>
  );
}
