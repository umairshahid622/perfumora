"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";
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
 * Fixed, not absolute. An absolutely-positioned layer scrolls away with the
 * document, which would mean the travel had to fight the page's own scrolling to
 * stay on screen; fixed pins it to the viewport so the waypoint poses are read
 * directly as screen position.
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
   * The Ritual is the last beat the bottle appears in, so the layer has to leave
   * with it — a fixed canvas has no end of its own and would otherwise hang over
   * Craft, Gallery and everything below. Scrubbed against the Ritual's exit so the
   * product dissolves as the section it belongs to scrolls away, and comes back on
   * the way up.
   *
   * `autoAlpha` (not `opacity`) so a faded-out layer is `visibility: hidden` too,
   * which stops the browser compositing a full-viewport transparent canvas over
   * every section below it.
   */
  useGSAP(() => {
    const trigger = `#${SECTION_IDS.ritual}`;

    // The fade is load-bearing, not a flourish — without it the bottle sits over
    // the rest of the page — so reduced motion still gets the state change, just
    // switched at the boundary instead of scrubbed across it.
    if (prefersReducedMotion()) {
      ScrollTrigger.create({
        trigger,
        start: "bottom center",
        onEnter: () => gsap.set(layer.current, { autoAlpha: 0 }),
        onLeaveBack: () => gsap.set(layer.current, { autoAlpha: 1 }),
      });
      return;
    }

    gsap.fromTo(
      layer.current,
      { autoAlpha: 1 },
      {
        autoAlpha: 0,
        ease: "none",
        scrollTrigger: {
          trigger,
          // Begins once the Ritual's bottom passes the middle of the screen — the
          // steps have been read — and completes as that edge leaves the top.
          start: "bottom center",
          end: "bottom top",
          scrub: 1,
        },
      },
    );
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
