"use client";

import { useState } from "react";
import { Eyebrow } from "../ui/Eyebrow";
import { Price } from "./Price";
import { SizeSelector } from "./SizeSelector";
import { RippleButton } from "../ui/RippleButton";
import { useCart } from "../../_lib/cart-context";
import { useScent } from "../../_lib/scent-context";
import { defaultSize, offeredSizes, type SizeMl } from "../../_lib/variants";

/**
 * Persistent product bar (§4.1) — price, variant name, size selector, and Add to Bag.
 * Stays accessible across all opening stage beats (Hero, Manifesto, Ritual).
 */
export function ProductBar() {
  const { variant } = useScent();
  const { addItem } = useCart();
  const [picked, setPicked] = useState<SizeMl | null>(null);

  const offered = offeredSizes(variant.sizes);
  const size =
    picked && offered.includes(picked) ? picked : defaultSize(variant.sizes);
  const { price, stock } = variant.sizes[size]!;
  const soldOut = stock === 0;

  const addToBag = () => {
    addItem({
      variantId: variant.id,
      name: variant.name,
      hex: variant.hex,
      size,
      price,
    });
  };

  return (
    <div className="grid grid-cols-2 items-end gap-3 py-4 md:grid-cols-3 md:gap-6 md:py-4 pointer-events-auto">
      <div className="order-2 md:order-1 min-w-0">
        <Eyebrow className="whitespace-nowrap">{variant.name} · Parfum</Eyebrow>
        <Price value={price} />
      </div>

      <div className="order-1 col-span-2 flex justify-center md:order-2 md:col-span-1 md:justify-center">
        <SizeSelector value={size} onChange={setPicked} sizes={variant.sizes} />
      </div>

      <div className="order-3 flex justify-end md:order-3">
        <RippleButton
          onClick={addToBag}
          disabled={soldOut}
          aria-label={
            soldOut
              ? `${variant.name}, ${size}ml, sold out`
              : `Add ${variant.name} to bag`
          }
        >
          {soldOut ? "Sold Out" : "Add to Bag"}
        </RippleButton>
      </div>
    </div>
  );
}
