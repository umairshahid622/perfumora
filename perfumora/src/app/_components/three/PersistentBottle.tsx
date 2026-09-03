"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SECTION_IDS } from "../../_lib/sections";
import { useScent } from "../../_lib/scent-context";
import { BottleSceneMount } from "./BottleSceneMount";

gsap.registerPlugin(ScrollTrigger);

/**
 * The site's one bottle, as a layer rather than a slot.
 *
 * Mounted once at the top of the home route and never unmounted, so a single
 * `<Canvas>` — one WebGL context, one glTF, one environment map — is shared by
 * every beat that shows the product. The sections it travels through (Hero →
 * Manifesto → Ritual) reserve empty space for it and never contain it; where it
 * sits inside this fixed frame is `useBottleScroll`'s waypoint list, driven by
 * scroll. That is what makes the journey continuous: nothing is ever torn down and
 * rebuilt between sections, so the model can simply *move*.
 *
 * Fixed, not absolute — for the length of the journey. An absolutely-positioned
 * layer scrolls away with the document, which would mean the travel had to fight the
 * page's own scrolling to stay on screen; fixed pins it to the viewport so the
 * waypoint poses are read directly as screen position. Once the journey is over that
 * property is exactly what is wanted, and the effect below switches to it.
 *
 * `pointer-events-none` (and the matching switch-off inside `BottleScene`, which
 * R3F needs separately) keeps this full-viewport layer from swallowing clicks
 * meant for the Hero's arrows, the size selector and Add to Bag underneath it.
 *
 * z-40 sits it above the sections' own content — including the oversized
 * fragrance watermark it is centred on — and below the nav (z-60) and the
 * first-load curtain (z-100).
 */
export function PersistentBottle() {
  const { variant, index, direction } = useScent();
  const layer = useRef<HTMLDivElement>(null);

  /**
   * The Ritual is the last beat the bottle appears in, and this is where the layer
   * stops being pinned to the viewport and is handed to the page.
   *
   * A fixed layer has no end of its own: left alone it would hang in the middle of
   * the screen over Craft, Gallery and everything below. Rather than animate it out —
   * which means deriving an off-screen pose and a rise that matches the page's speed,
   * both of which have to be re-derived per viewport — the layer is simply *released*
   * at the Ritual's middle: `fixed` becomes `absolute` at the document offset it was
   * already occupying, and from that frame the document carries the vessel away.
   * Perfectly in step with the section it belongs to, because it *is* the section's
   * scrolling doing the work, at any screen size and with nothing to tune.
   *
   * `self.start` rather than `window.scrollY`: it is the scroll position the trigger
   * is defined at, so the handover lands on the intended offset even if the callback
   * fires a frame late during a fast scroll. `bottom: auto` with an explicit height
   * because the `inset-0` that sizes the fixed layer would otherwise stretch the
   * released one from that offset to the foot of the document.
   *
   * Nothing needs to move for reduced motion — this is a position handover, not an
   * animation, and it is what stops the bottle covering the rest of the page.
   */
  useGSAP(() => {
    /**
     * Released: parked at the document offset the viewport had reached, so the page
     * scrolls it away. Pinned: back to what `inset-0` gives the fixed layer.
     */
    const setReleased = (released: boolean, offset: number) =>
      gsap.set(
        layer.current,
        released
          ? { position: "absolute", top: offset, bottom: "auto", height: "100vh" }
          : { position: "fixed", top: 0, bottom: 0, height: "auto" },
      );

    ScrollTrigger.create({
      trigger: `#${SECTION_IDS.ritual}`,
      start: "center center",
      onEnter: (self) => setReleased(true, self.start),
      onLeaveBack: (self) => setReleased(false, self.start),
      // Runs on creation and after every resize, which is what makes the handover
      // stateless: a reload part-way down the page starts released instead of
      // pinning the bottle over Craft, and a resize while released re-parks it at
      // the recomputed offset instead of stranding it at the old one.
      onRefresh: (self) => setReleased(self.scroll() >= self.start, self.start),
    });
  });

  return (
    <div
      ref={layer}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40"
    >
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
