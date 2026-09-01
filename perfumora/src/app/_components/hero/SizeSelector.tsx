"use client";

import { cn } from "../../_lib/cn";
import { SIZES, type SizeMl } from "../../_lib/variants";

/**
 * The 30ml / 50ml size toggle (§4.1). Controlled by the Hero so the price block
 * and the Add-to-Bag payload stay in sync with the choice. Two pills; the active
 * one is outlined in the live accent, the other sits on a hairline.
 */
export function SizeSelector({
  value,
  onChange,
}: {
  value: SizeMl;
  onChange: (size: SizeMl) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Size" className="flex items-center gap-2">
      {SIZES.map((size) => {
        const active = size === value;
        return (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              onChange(size);
            }}
            className={cn(
              "text-micro rounded-full border px-5 py-2 font-medium uppercase transition-colors",
              active
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
