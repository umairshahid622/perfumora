"use client";

import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Eyebrow } from "../ui/Eyebrow";
import { Price } from "./Price";
import { SizeSelector } from "./SizeSelector";
import { RippleButton } from "../ui/RippleButton";
import { useCart } from "../../_lib/cart-context";
import { useScent } from "../../_lib/scent-context";
import { prefersReducedMotion } from "../../_lib/motion";
import { defaultSize, offeredSizes, quotedSize, type SizeMl } from "../../_lib/variants";

/**
 * Persistent product bar (§4.1) — price, variant name, size selector, and Add to Bag.
 * Stays accessible across all opening stage beats (Hero, Manifesto, Ritual).
 */
export function ProductBar() {
  const { variant, index } = useScent();
  const { addItem } = useCart();
  const [picked, setPicked] = useState<SizeMl | null>(null);
  const eyebrowScopeRef = useRef<HTMLSpanElement>(null);
  const firstRun = useRef(true);

  const offered = offeredSizes(variant.sizes);
  // The size the bar is quoting, or `null` when every size is out of stock — in
  // which case nothing is selected and the button below is the Sold Out state.
  const size = picked && offered.includes(picked) ? picked : defaultSize(variant.sizes);
  // With no selection there is nothing to price, so the bar falls back to the
  // entry size rather than quoting one that is not on screen. See `quotedSize`.
  const { price, stock } = quotedSize(variant.sizes, size);
  const soldOut = stock === 0;

  const text = `${variant.name} · ${variant.concentration ?? "Eau de Parfum"}`;

  /** What the button announces. With no size selected there is none to name, so
   *  the label drops the volume rather than reading "nullml". */
  const addLabel = soldOut
    ? size
      ? `${variant.name}, ${size}ml, sold out`
      : `${variant.name}, sold out`
    : `Add ${variant.name} to bag`;

  useGSAP(
    () => {
      const snap = firstRun.current || prefersReducedMotion();
      firstRun.current = false;
      if (snap) return;

      gsap.fromTo(
        ".eyebrow-letter",
        { yPercent: 55, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.025,
          ease: "power3.out",
        },
      );
    },
    { scope: eyebrowScopeRef, dependencies: [index], revertOnUpdate: true },
  );

  const addToBag = () => {
    // Unreachable while the button is disabled — which is exactly when `size` is
    // null — but the guard keeps the null out of the payload rather than
    // asserting it away.
    if (!size) return;
    addItem({
      variantId: variant.id,
      name: variant.name,
      hex: variant.hex,
      size,
      price,
    });
  };

  return (
    <div className="grid grid-cols-2 items-end gap-3 py-4 md:grid-cols-3 md:gap-6 md:py-4 pointer-events-[inherit]">
      <div className="order-2 md:order-1 min-w-0">
        <Eyebrow className="whitespace-nowrap overflow-hidden">
          <span ref={eyebrowScopeRef} className="inline-block">
            {text.split("").map((letter, i) => (
              <span
                key={`${index}-${i}`}
                className="eyebrow-letter inline-block"
              >
                {letter === " " ? "\u00A0" : letter}
              </span>
            ))}
          </span>
        </Eyebrow>
        <Price value={price} />
      </div>

      <div className="order-1 col-span-2 flex justify-center md:order-2 md:col-span-1 md:justify-center">
        <SizeSelector value={size} onChange={setPicked} sizes={variant.sizes} />
      </div>

      <div className="order-3 flex justify-end md:order-3">
        <RippleButton
          onClick={addToBag}
          disabled={soldOut}
          aria-label={addLabel}
        >
          {soldOut ? "Sold Out" : "Add to Bag"}
        </RippleButton>
      </div>
    </div>
  );
}
