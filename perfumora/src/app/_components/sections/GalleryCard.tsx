"use client";

import { useState, type CSSProperties } from "react";
import { useCart } from "../../_lib/cart-context";
import {
  defaultSize,
  formatPrice,
  readableAccent,
  type SizeMl,
  type Variant,
} from "../../_lib/variants";
import { ImagePlaceholder } from "../ui/ImagePlaceholder";
import { RippleButton } from "../ui/RippleButton";
import { SizeSelector } from "../hero/SizeSelector";

/**
 * One fragrance in the showcase grid — a self-contained product card built on the
 * reference layout: a colour panel up top with the bottle lifted off it, a price
 * tag emerging from the seam, then the name, tagline and commerce below.
 *
 * The panel takes the fragrance's *own* colour, floored for depth (readableAccent
 * → ≤0.2 luminance), so pigmented juices get rich arches and the near-clear ones
 * go deep charcoal rather than blank. That same floored colour is scoped onto the
 * card as --accent / --accent-on-light so the reused <SizeSelector> and
 * <RippleButton> tint to *this* fragrance instead of the Hero's live selection —
 * they read those tokens, so overriding them here is all it takes. Because the
 * floored colour is always dark, the label contrast is always --paper.
 *
 * The outer <li className="g-item"> and inner ".g-item-inner" are the hooks the
 * parent's scroll-drift animation targets; a size change re-renders the price in
 * place without remounting the <li>, so its ScrollTrigger stays valid.
 *
 * Swap the <ImagePlaceholder> for the HD bottle photo per variant when it lands —
 * a transparent PNG drops straight onto the panel and pops.
 */
export function GalleryCard({
  variant,
  position,
}: {
  variant: Variant;
  position: string;
}) {
  const { addItem } = useCart();
  // Unlike the Hero's, this card's fragrance never changes under the selection —
  // the grid keys each card by variant id — so the opening size is an initialiser
  // and there is nothing to reconcile on re-render.
  const [size, setSize] = useState<SizeMl>(() => defaultSize(variant.sizes));

  const accent = readableAccent(variant.hex);
  // Present by construction: `size` only ever holds a size this fragrance sells.
  const { price, stock } = variant.sizes[size]!;
  const soldOut = stock === 0;

  const add = () =>
    addItem({
      variantId: variant.id,
      name: variant.name,
      hex: variant.hex,
      size,
      price,
    });

  // Scope the accent tokens to THIS card. The accent utilities are var()-based,
  // so the reused controls below inherit the card's own floored colour.
  const cardVars = {
    "--accent": accent,
    "--accent-on-light": accent,
    "--accent-contrast": "var(--paper)",
  } as CSSProperties;

  return (
    <li className="g-item">
      <div className="g-item-inner will-change-transform" style={cardVars}>
        <article className="border-hairline-on-light relative overflow-hidden rounded-[1.75rem] border bg-[#faf6ee] shadow-[0_18px_44px_-26px_rgba(27,23,18,0.5)]">
          {/* Colour panel — the fragrance's own hue, floored for depth (§3.3).
              The card clips the top corners; the future transparent bottle PNG
              drops straight in here and pops. */}
          <div className="relative" style={{ backgroundColor: accent }}>
            {/* Studio-light wash: a soft top highlight that lifts the bottle. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 78% at 50% 14%, rgba(255,255,255,0.16), transparent 62%)",
              }}
            />

            {/* Collection index — the badge anchor (top-left, where the reference
                puts "New"). A real datum, not invented copy. */}
            <span className="text-paper text-micro bg-paper/15 absolute top-3 left-3 z-20 rounded-full px-3 py-1 font-medium uppercase backdrop-blur-sm">
              {position}
            </span>

            {/* Product — placeholder now, HD bottle shot later. The drop shadow
                reads it as lifted off the panel. */}
            <div className="relative z-10 px-7 pt-9 pb-11">
              <div className="mx-auto aspect-[3/4] w-[74%] drop-shadow-[0_24px_30px_rgba(11,11,12,0.55)]">
                <ImagePlaceholder
                  tone="dark"
                  label={variant.name}
                  className="h-full w-full"
                />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6">
            {/* Price tag — pulled up to straddle the seam, filled in the card's
                own accent so it reads as emerging from the panel above it. */}
            <div className="mt-3 mb-4 flex">
              <span className="bg-accent text-accent-contrast inline-flex items-center rounded-full px-4 py-1.5 text-[0.95rem] font-semibold tracking-tight tabular-nums shadow-[0_10px_22px_-10px_rgba(11,11,12,0.6)]">
                {formatPrice(price)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="text-ink text-lg leading-tight font-semibold tracking-tight">
                {variant.name}
              </h3>
              <span className="text-muted-on-light text-micro font-medium uppercase">
                Parfum
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <SizeSelector
                value={size}
                onChange={setSize}
                sizes={variant.sizes}
              />
              <RippleButton
                onClick={add}
                disabled={soldOut}
                className="w-full"
                aria-label={
                  soldOut
                    ? `${variant.name}, ${size}ml, sold out`
                    : `Add ${variant.name}, ${size}ml, to bag`
                }
              >
                {soldOut ? "Sold Out" : "Add to Bag"}
              </RippleButton>
            </div>
          </div>
        </article>
      </div>
    </li>
  );
}
