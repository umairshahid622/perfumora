"use client";

import { useScent } from "../../_lib/scent-context";
import { BottleSceneMount } from "./BottleSceneMount";

/**
 * The site's one bottle, as a layer rather than a slot.
 *
 * Mounted once inside `<OpeningStage>` and never unmounted while that stage is on
 * screen, so a single `<Canvas>` — one WebGL context, one glTF, one environment map
 * — serves both of the beats it appears in. Deliberately *not* rendered inside
 * <Hero> or <Manifesto>: neither section contains the vessel, which is what keeps
 * the model clear of any one section's stacking context and overflow.
 *
 * It has no scroll logic of its own, and that is the whole design. This fills the
 * stage's lifted wrapper, the same element the Manifesto panel sits in — so it is
 * nailed to the viewport for as long as that wrapper is lifted or stuck, holds one
 * pose through the Hero and the Manifesto without moving a pixel, and then scrolls
 * up out of frame with the Manifesto when the stage releases. Leaving is inherited
 * from its parent rather than driven by a scroll position of its own, which is why
 * the Ritual and everything below it have no bottle and need no code to not have
 * one. `absolute` (not `fixed`) is what buys that: fixed to the viewport it could
 * never leave, and it does not need to be — the wrapper above it already is.
 *
 * `pointer-events-none` (and the matching switch-off inside `BottleScene`, which
 * R3F needs separately) keeps this full-viewport layer from swallowing clicks
 * meant for the Hero's arrows, the size selector and Add to Bag underneath it.
 *
 * z-40 orders it above the Manifesto panel beside it in that wrapper; the wrapper's
 * own z-30 is what carries the pair above the sections' content — including the
 * oversized fragrance watermark the vessel is centred on — and below the nav (z-60)
 * and the first-load curtain (z-100).
 */
export function PersistentBottle() {
  const { variant, index, direction } = useScent();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-40">
      {/* Fragrance colour comes from the variant itself rather than the `--accent`
          token: <ScentProvider> writes that token in an effect, so reading it
          during this render trails one variant behind. */}
      <BottleSceneMount
        className="h-full w-full"
        liquidColor={variant.hex}
        variantIndex={index}
        spinDirection={direction}
      />
    </div>
  );
}
