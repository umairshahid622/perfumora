"use client";

import { useState } from "react";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RippleButton } from "../ui/RippleButton";
import { Section } from "../ui/Section";
import { FragranceName } from "./FragranceName";
import { PositionCounter } from "./PositionCounter";
import { Price } from "./Price";
import { SizeSelector } from "./SizeSelector";
import { VariantArrows } from "./VariantArrows";
import { useCart } from "../../_lib/cart-context";
import { useScent } from "../../_lib/scent-context";
import { SECTION_IDS } from "../../_lib/sections";
import { priceFor, type SizeMl } from "../../_lib/variants";

/**
 * Hero / product showcase (§4.1). The 3D bottle is the centre of gravity; the
 * variant name sits behind it as oversized watermark type, the accent glow
 * washes up from beneath it, and the product controls (price, size, add-to-bag)
 * line the base. Prev/next arrows flank the vessel and drive the live variant.
 *
 * The model itself is *not* mounted here. It is the one persistent
 * `<PersistentBottle>` layer over the whole route, so it can travel on into the
 * Manifesto and the Ritual instead of being torn down with this section; what the
 * stage below holds is the empty space it rests in while the Hero is on screen.
 */
export function Hero() {
  const { variant } = useScent();
  const { addItem } = useCart();
  const [size, setSize] = useState<SizeMl>(50);

  const price = priceFor(size);

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
    <Section id={SECTION_IDS.hero} full className="pt-[4.75rem]">
      {/* Accent glow wash rising from beneath the bottle (§3.3). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 46% at 50% 56%, var(--accent-glow), transparent 72%)",
        }}
      />

      <Container className="relative z-10 flex flex-1 flex-col">

        {/* Stage */}
        <div className="relative flex flex-1 items-center justify-center py-1">
          {/* Oversized variant name, behind the bottle */}
          <FragranceName />

          {/* Reserved space the persistent bottle rests over while the Hero is in
              view. Kept as a real box, not a bare gap, so the stage keeps its
              height and the arrows and product bar stay where they were. The
              phone value is the tighter one on purpose: below `md` the product bar
              breaks into three stacked rows, and this box plus those rows plus the
              counter have to stay inside one screen. */}
          <div
            aria-hidden="true"
            className="relative z-10 h-[46vh] w-full max-w-lg md:h-[60vh]"
          />

          {/* Flanking prev/next arrows */}
          <div className="pointer-events-none absolute inset-0 z-20">
            <VariantArrows />
          </div>
        </div>

        {/* Position counter — the Hero's sole position indicator (§4.1). */}
        <PositionCounter />

        {/* Product bar */}
        <div className="grid grid-cols-1 items-end gap-6 py-8 md:grid-cols-3 md:py-4">
          <div className="order-2 md:order-1">
            <Eyebrow>{variant.name} · Parfum</Eyebrow>
            <Price value={price} />
          </div>

          <div className="order-1 flex justify-start md:order-2 md:justify-center">
            <SizeSelector value={size} onChange={setSize} />
          </div>

          <div className="order-3 flex sm:justify-end">
            <RippleButton onClick={addToBag} aria-label={`Add ${variant.name} to bag`}>
              Add to Bag
            </RippleButton>
          </div>
        </div>
      </Container>
    </Section>
  );
}
