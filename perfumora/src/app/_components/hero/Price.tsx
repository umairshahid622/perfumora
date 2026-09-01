"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../_lib/motion";
import { formatPrice } from "../../_lib/variants";

/**
 * Long enough to read as the figure travelling, short enough that the price is
 * settled before you have finished looking at the size you just pressed.
 */
const ROLL_DURATION = 0.5;

/**
 * The price, and its size-change transition (§4.1): choosing a size rolls the
 * figure from the old price to the new one instead of swapping it, so the number
 * is visibly moved *by* the press rather than replaced behind it.
 *
 * `power1.out` rather than the sharper `power3.out` the name transition uses: an
 * out-ease that strong spends its last third already parked on the target, and a
 * counter whose digits stop changing before it stops animating reads as stuck.
 */
export function Price({ value }: { value: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const shown = useRef(value);

  useGSAP(
    () => {
      const el = ref.current;
      const from = shown.current;
      shown.current = value;

      // Nothing to travel from on first paint, and reduced motion wants the
      // figure simply correct. Both fall through to the rendered value below.
      if (!el || from === value || prefersReducedMotion()) return;

      // `snap` keeps the tweened figure a whole number of dollars, so the
      // formatter never has to round and no fractional price is ever painted.
      const figure = { value: from };
      gsap.to(figure, {
        value,
        duration: ROLL_DURATION,
        ease: "power1.out",
        snap: { value: 1 },
        // A press mid-roll picks the figure up wherever it has got to rather
        // than restarting it from the price two steps ago.
        overwrite: true,
        onUpdate: () => {
          el.textContent = formatPrice(figure.value);
        },
      });
    },
    { dependencies: [value] },
  );

  return (
    // React renders the *destination*, which is what makes handing the text node
    // to GSAP safe: React only writes `children` when it differs from the string
    // it last rendered (react-dom 19's `updateProperties`), so a re-render
    // mid-roll — a variant change, say — leaves the DOM and the roll alone. Any
    // re-render that does write is one where `value` changed, which starts a new
    // roll anyway.
    //
    // A plain string, deliberately not `cn()`: tailwind-merge does not know this
    // project's `--text-*` scale, so it reads `text-price` as a colour utility
    // and lets `text-accent-on-light` overrule it — which silently drops the price to the
    // inherited body size.
    //
    // `tabular-nums` asks the face for fixed-width figures so the number does not
    // breathe as it counts. Harmless if Khand has no `tnum`: the roll only ever
    // paints `$` and three digits, so the most that can move is the right edge of
    // a left-aligned block.
    <p
      ref={ref}
      className="text-price text-accent-on-light font-display mt-2 leading-none tabular-nums"
    >
      {formatPrice(value)}
    </p>
  );
}
