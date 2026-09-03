"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";
import type { BottleRefs } from "./useBottleRefs";

gsap.registerPlugin(ScrollTrigger);

/**
 * The bottle's ambient idle drift (§6.3 #9) — the "breathing" beat. A slow,
 * continuous bob with a fainter roll layered over it, authored in GSAP like every
 * other motion (§5) and targeting the assembly root the bottle refs expose, so it
 * moves the whole product as one object and never touches the Cap/Atomizer inside.
 *
 * Reusable on purpose: an optional `trigger` links the idle timeline to a
 * `ScrollTrigger` so it only runs while that span is on screen. The persistent
 * bottle gates it to the Manifesto onward — through the Hero the product is dead
 * still (it turns only on a variant change), and the float wakes as the Manifesto
 * scrolls in. Leave `trigger` unset for a placement meant to drift continuously.
 *
 * Two deliberate axis choices keep it clear of the fragrance-change spin in
 * `BottleScene`, which tweens `root.rotation.y` on this same group: the bob is
 * `position.y` (a different object entirely) and the roll is `rotation.z`. That
 * spin overwrites with `"auto"`, so it only ever kills a conflicting `rotation.y`
 * and leaves this timeline's roll alone — a variant change mid-float can't stop it.
 */
interface BottleFloatOptions {
  /** Master switch — the whole hook is inert unless a caller opts in. */
  enabled: boolean;
  /**
   * Whether the model has finished loading and `refs.root` is wired. The root is
   * null until the glTF resolves inside `<Suspense>`, and that resolution does not
   * re-run this hook on its own — the caller flips this once, which re-runs the
   * effect with a root to animate.
   */
  ready: boolean;
  /** Section selector (e.g. `#manifesto`) to gate the float to its own view. */
  trigger?: string;
  /** How far past the trigger's start the float stays awake. */
  endTrigger?: string;
  /** Bob distance in world units — a fraction of the model's framed height (2.4). */
  amplitude?: number;
  /** Seconds for one leg of the bob; the roll runs a little slower, to drift. */
  duration?: number;
  /** Roll amplitude in radians (~0.05 ≈ 3°). */
  sway?: number;
}

export function useBottleFloat(
  refs: BottleRefs,
  {
    enabled,
    ready,
    trigger,
    endTrigger,
    amplitude = 0.1,
    duration = 2.6,
    sway = 0.05,
  }: BottleFloatOptions,
): void {
  useGSAP(
    () => {
      // Reduced motion leaves the bottle at rest — a perpetual drift is exactly
      // the kind of ambient movement that setting opts out of.
      if (!enabled || prefersReducedMotion()) return;
      const root = refs.root.current;
      if (!root) return;

      // Two infinite yoyo tweens on their own periods, nested in one parent so a
      // single ScrollTrigger can play/pause the pair. Different durations keep the
      // bob and the roll out of phase, so the drift never resolves into an obvious
      // loop. Starting both at position 0 layers them from the same instant.
      const tl = gsap.timeline({
        scrollTrigger: trigger
          ? {
              trigger,
              // Awake from the moment this section's top reaches the top of the
              // screen — so the float stays asleep while the Hero is still up and
              // wakes only as the story moves on. Linked (not scrubbed)
              // animations start paused, so `toggleActions` is what plays them:
              // idle motion, never tied to scroll position.
              start: "top top",
              endTrigger,
              end: "bottom top",
              toggleActions: "play pause resume pause",
            }
          : undefined,
      });

      tl.to(
        root.position,
        {
          y: `+=${amplitude}`,
          duration,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
        0,
      ).to(
        root.rotation,
        {
          z: sway,
          duration: duration * 1.35,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
        0,
      );
    },
    { dependencies: [enabled, ready, trigger, endTrigger] },
  );
}

