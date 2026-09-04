"use client";

import { cn } from "../../_lib/cn";
import { offeredSizes, type SizeMap, type SizeMl } from "../../_lib/variants";

/**
 * The size toggle (§4.1). Controlled by whoever owns the selection — the Hero for
 * the live variant, a gallery card for its own — so the price block and the
 * Add-to-Bag payload stay in sync with the choice. The active pill is outlined in
 * the live accent, the others sit on a hairline.
 *
 * It renders the sizes *this* fragrance sells, not a fixed 30/50 pair: the
 * catalogue prices per fragrance *and* size, and a row's absence means we don't
 * sell it, so a 30ml-only fragrance gets one pill. A size that is sold but out of
 * stock still gets a pill — hiding it would say "we don't make this", which is a
 * different thing — struck through and disabled, with the state in the accessible
 * name too so it doesn't rest on colour or a dimmed edge alone.
 */
export function SizeSelector({
  sizes,
  value,
  onChange,
}: {
  sizes: SizeMap;
  value: SizeMl;
  onChange: (size: SizeMl) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Size" className="flex items-center gap-2">
      {offeredSizes(sizes).map((size) => {
        const active = size === value;
        const soldOut = sizes[size]?.stock === 0;
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={soldOut}
            aria-label={soldOut ? `${size}ml, sold out` : undefined}
            onClick={() => {
              onChange(size);
            }}
            className={cn(
              "text-micro rounded-full border px-5 py-2 font-medium uppercase transition-colors",
              soldOut
                ? "border-hairline-on-light text-muted-on-light cursor-not-allowed line-through opacity-45"
                : active
                  ? "border-accent-on-light text-accent-on-light"
                  : "border-hairline-on-light text-muted-on-light hover:text-ink",
            )}
          >
            {size}ml
          </button>
        );
      })}
    </div>
  );
}
