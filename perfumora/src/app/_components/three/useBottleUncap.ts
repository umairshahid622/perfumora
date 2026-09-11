"use client";

import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Box3, Vector3, type Object3D } from "three";
import { prefersReducedMotion } from "../../_lib/motion";
import { useSoundCue } from "../../_hooks/useSoundCue";
import { MIST_OPACITY, MIST_COLLAPSED } from "./BottleMist";
import type { BottleRefs } from "./useBottleRefs";

gsap.registerPlugin(ScrollTrigger);

/**
 * How far the closure rises and how far the pump button dips, both as multiples
 * of the closure's own measured height — so the gesture survives the model being
 * re-exported at another scale. 1.15 is just over the closure's height, which
 * takes its lower rim clear of the pump head it was covering with air to spare;
 * the button's dip is a click, not a stroke.
 */
const LIFT = 1.22;
const PRESS = 0.08;

const UNCAP_DURATION = 0.45;
const STRAIGHTEN_DURATION = 0.2;
const UNCAP_START = STRAIGHTEN_DURATION;
const PRESS_DOWN = 0.1;
const PRESS_UP = 0.18;
const SPRAY_DURATION = 0.6;
/** How quickly the mist arrives once the button bottoms out. */
const MIST_IN = 0.12;
/** How long the showcase takes to glide the cap shut once its window is entered. */
const SHOWCASE_CLOSE_DURATION = 0.9;

/** The instant the pump fires: the button has just bottomed out. */
const SPRAY_AT = UNCAP_DURATION + PRESS_DOWN;

export const RITUAL_STEPS_DELAY = UNCAP_START + 0.1;
export const SPRAY_START_EVENT = "perfumora:spray-start";
export const SPRAY_COMPLETE_EVENT = "perfumora:spray-complete";
export const SPRAY_RESET_EVENT = "perfumora:spray-reset";

/**
 * An object's height in the space its own `position` is written in — its
 * parent's. `setFromObject` reports world size, and by the time this runs the
 * model is mounted inside two nested scaled groups, so dividing by the parent's
 * world scale brings the measurement back into the object's own frame. Children
 * count: the closure's clear sleeve hangs below the dark cap it belongs to, and
 * it is the sleeve's rim that has to clear the pump.
 */
function localHeight(object: Object3D): number {
  // R3F updates world matrices on its own render loop, which has not
  // necessarily run since this object was committed.
  object.updateWorldMatrix(true, true);
  const size = new Box3().setFromObject(object).getSize(new Vector3());
  const scale = object.parent?.getWorldScale(new Vector3());
  return scale ? size.y / scale.y : size.y;
}

interface BottleUncapOptions {
  /** Master switch — the whole hook is inert unless a caller opts in. */
  enabled: boolean;
  /**
   * Whether the glTF has resolved and the refs below are wired. Null until it
   * does, and that resolution does not re-run this hook on its own — the caller
   * flips this once, which re-runs the effect with a model to animate.
   */
  ready: boolean;
  /** Selector for the beat this belongs to (`#ritual`). */
  trigger: string;
}

/**
 * The Ritual's one piece of theatre (§4.3): the closure lifts off the bottle,
 * the pump fires, and the fragrance hangs in the air.
 *
 * Played, not scrubbed, which is the one place this stage departs from its own
 * idiom — and deliberately. Everything else in the opening is a *state* the
 * wheel drives back and forth; a spray is an *event*, and an event dragged
 * backwards and forwards by a scroll wheel stops being one. So the beat's own
 * screen of scroll is the cue and the timeline plays at its own pace from there.
 *
 * It plays on the downward entry only. A detach without the spray that
 * justifies it is the one thing the beat must not show, so nothing here lifts
 * the cap going up — not an upward re-entry from the showcase, and not the
 * showcase itself, whose glide-shut is its own one-way event below. Leaving
 * through the top seats the cap outright and reverses only the straighten, so
 * the bottle is whole again for the two beats that come before it and the next
 * downward entry replays the whole sequence from the top.
 *
 * The window is `#ritual`'s own screen of the document, the third of the stage's
 * four, which is exactly the screen `<OpeningStage>` leaves still for reading.
 * That section's position is honest despite its wrapper spending that scroll
 * lifted over the viewport, because the stage drops every lift for the length of
 * a refresh — see the `refreshInit` pair there.
 *
 * Reduced motion keeps the composition and drops the performance: the closure
 * still comes off, because a floating cap is what the beat *is*, but it arrives
 * there without travel and neither the pump nor the mist runs.
 */
export function useBottleUncap(
  refs: BottleRefs,
  { enabled, ready, trigger }: BottleUncapOptions,
): void {
  const { playSpray } = useSoundCue();
  const initialCapY = useRef<number | null>(null);
  const initialButtonY = useRef<number | null>(null);
  // The spray cue read at fire time, not captured at build time. `playSpray`
  // changes identity whenever the sound context's `isMuted` flips, and it was
  // a dependency of the useGSAP below — so a press of the nav's mute toggle
  // rebuilt every timeline here (cap, spray, showcase) *and* ran the full
  // `ScrollTrigger.refresh()` at the bottom, a whole-page re-measure in the
  // middle of an ordinary interaction. The cue is only ever called from a tween
  // callback, so a ref keeps it current without owning the hook's schedule.
  const playSprayRef = useRef(playSpray);
  useEffect(() => {
    playSprayRef.current = playSpray;
  }, [playSpray]);

  useGSAP(
    () => {
      if (!enabled) return;
      const cap = refs.cap.current;
      if (!cap) return;

      if (initialCapY.current === null) {
        initialCapY.current = cap.position.y;
      }
      const baseCapY = initialCapY.current;

      const still = prefersReducedMotion();
      const height = localHeight(cap);

      const stageEl =
        document.querySelector<HTMLElement>("[data-opening-stage]") ||
        document.body;

      const button = refs.pumpButton.current;
      const mist = refs.mist.current;
      const material = refs.mistMaterial.current;

      if (button && initialButtonY.current === null) {
        initialButtonY.current = button.position.y;
      }
      const baseButtonY = initialButtonY.current ?? 0;

      // Clean state helper for spray effects
      const resetSprayState = () => {
        if (button) gsap.set(button.position, { y: baseButtonY });
        if (mist) {
          gsap.set(mist.scale, {
            x: MIST_COLLAPSED,
            y: MIST_COLLAPSED,
            z: MIST_COLLAPSED,
          });
        }
        if (material) gsap.set(material, { opacity: 0 });
      };

      let activeSprayTl: gsap.core.Timeline | null = null;

      // Master Directional Ritual Controller:
      // - Downward entry: Cap smoothly un-caps, pump fires, mist sprays, steps reveal.
      // - Downward exit into Craft: Cap smoothly glides shut with a weighted 0.6s ease.
      // - Upward scrolling (from Craft through Ritual back to Hero): CAP STAYS CLOSED!
      // - Upward exit into Manifesto: Resets trigger so future downward passes uncap fresh.
      ScrollTrigger.create({
        trigger: stageEl,
        start: () => "top+=" + Math.round(window.innerHeight * 2.95) + " top",
        end: () => "top+=" + Math.round(window.innerHeight * 3.6) + " top",
        fastScrollEnd: true,
        preventOverlaps: true,
        onEnter: (self) => {
          const isFast = Math.abs(self.getVelocity()) > 2000;

          // Lift cap smoothly on downward entry
          gsap.to(cap.position, {
            y: baseCapY + height * LIFT,
            duration: still || isFast ? 0.2 : UNCAP_DURATION,
            ease: "power2.out",
            overwrite: "auto",
          });

          if (still || isFast || !button || !mist || !material) {
            resetSprayState();
            window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT));
            return;
          }

          if (activeSprayTl) activeSprayTl.kill();
          resetSprayState();

          activeSprayTl = gsap.timeline({
            onComplete: () => {
              window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT));
            },
          });

          // Press pump button
          activeSprayTl
            .to(
              button.position,
              {
                y: baseButtonY - height * PRESS,
                duration: PRESS_DOWN,
                ease: "power2.in",
                onStart: () => window.dispatchEvent(new Event(SPRAY_START_EVENT)),
              },
              UNCAP_START + UNCAP_DURATION,
            )
            .to(
              button.position,
              { y: baseButtonY, duration: PRESS_UP, ease: "power2.out" },
              UNCAP_START + SPRAY_AT,
            );

          // Mist spray & sound cue
          activeSprayTl
            .to(
              mist.scale,
              {
                x: 1,
                y: 1,
                z: 1,
                duration: SPRAY_DURATION,
                ease: "power2.out",
                onStart: () => playSprayRef.current(),
              },
              UNCAP_START + SPRAY_AT,
            )
            .to(
              material,
              { opacity: MIST_OPACITY, duration: MIST_IN, ease: "power1.out" },
              UNCAP_START + SPRAY_AT,
            )
            .to(
              material,
              {
                opacity: 0,
                duration: SPRAY_DURATION - MIST_IN,
                ease: "power1.in",
              },
              UNCAP_START + SPRAY_AT + MIST_IN,
            );
        },
        onLeave: () => {
          // Exiting downward past Ritual toward Craft:
          // Smooth, weighted glide-shut as bottle seals
          if (activeSprayTl) activeSprayTl.kill();
          resetSprayState();

          gsap.to(cap.position, {
            y: baseCapY,
            duration: still ? 0 : 0.6,
            ease: "power2.inOut",
            overwrite: "auto",
          });

          window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT));
        },
        onEnterBack: () => {
          // Re-entering upward from Craft:
          // DO NOT open cap — the bottle remains sealed when scrolling up!
          if (activeSprayTl) activeSprayTl.kill();
          resetSprayState();

          gsap.to(cap.position, {
            y: baseCapY,
            duration: 0,
            overwrite: "auto",
          });

          window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT));
        },
        onLeaveBack: () => {
          // Exiting upward back into Manifesto:
          // Ensure cap is seated and reset spray trigger so downward entries can uncap fresh
          if (activeSprayTl) activeSprayTl.kill();
          resetSprayState();

          gsap.to(cap.position, {
            y: baseCapY,
            duration: still ? 0 : 0.35,
            ease: "power2.inOut",
            overwrite: "auto",
          });

          window.dispatchEvent(new Event(SPRAY_RESET_EVENT));
        },
      });

      ScrollTrigger.refresh();
    },
    { dependencies: [enabled, ready, trigger] },
  );
}
