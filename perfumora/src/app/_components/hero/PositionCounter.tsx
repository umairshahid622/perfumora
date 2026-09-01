"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../_lib/motion";
import { useScent } from "../../_lib/scent-context";

/**
 * The position counter (§4.1) — the Hero's sole position indicator now that the
 * dot row is gone. Reads "NN / NN": the current number carries the live accent
 * and rolls to its new value on every change, entering from below when stepping
 * forward and from above when stepping back (it reads `direction` from
 * <ScentProvider>, so a wrap from the last SKU to the first still rolls the way
 * you travelled). The total is static; reduced motion swaps the value with no roll.
 */
export function PositionCounter() {
  const { index, count, direction } = useScent();
  const current = String(index + 1).padStart(2, "0");
  const total = String(count).padStart(2, "0");

  const numRef = useRef<HTMLSpanElement>(null);
  const prev = useRef(current);

  useGSAP(
    () => {
      if (prev.current === current) return; // mount / no change → no roll
      prev.current = current;
      if (prefersReducedMotion()) return;

      // The span already renders the new value; roll it in from the side we
      // travelled toward (forward → up from below, back → down from above).
      gsap.fromTo(
        numRef.current,
        { yPercent: direction >= 0 ? 100 : -100, autoAlpha: 0 },
        {
          yPercent: 0,
          autoAlpha: 1,
          duration: 0.5,
          ease: "power3.out",
          overwrite: true,
        },
      );
    },
    { dependencies: [current], revertOnUpdate: false },
  );

  return (
    <div className="flex items-end justify-center gap-2 tabular-nums select-none">
      {/* Mask clips the rolling digit block. */}
      <span className="inline-block overflow-hidden leading-none">
        <span
          ref={numRef}
          className="text-accent-on-light inline-block text-3xl leading-none font-light md:text-4xl"
        >
          {current}
        </span>
      </span>
      <span className="text-muted-on-light text-micro pb-1 font-medium uppercase">
        / {total}
      </span>
    </div>
  );
}
