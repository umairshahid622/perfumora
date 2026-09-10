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
const LIFT = 1.15;
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
      const tiltGroup = refs.tiltGroup.current;

      const stageEl = document.querySelector<HTMLElement>("[data-opening-stage]") || document.body;

      const button = refs.pumpButton.current;
      const mist = refs.mist.current;
      const material = refs.mistMaterial.current;

      if (!still && button && mist && material) {
        if (initialButtonY.current === null) {
          initialButtonY.current = button.position.y;
        }
        const baseButtonY = initialButtonY.current;

        // The spray is a one-way event. Keeping it out of the reversible cap
        // timeline prevents the mist from playing backward on upward scroll.
        const sprayTl = gsap.timeline({
          scrollTrigger: {
            trigger: stageEl,
            start: () => "top+=" + Math.round(window.innerHeight * 1.8) + " top",
            end: () => "top+=" + Math.round(window.innerHeight * 3.2) + " top",
            toggleActions: "restart none none none",
            onLeaveBack: () => {
              gsap.set(button.position, { y: baseButtonY });
              gsap.set(mist.scale, {
                x: MIST_COLLAPSED,
                y: MIST_COLLAPSED,
                z: MIST_COLLAPSED,
              });
              gsap.set(material, { opacity: 0 });
              sprayTl.pause(0);
              window.dispatchEvent(new Event(SPRAY_RESET_EVENT));
            },
            onLeave: () => {
              gsap.set(button.position, { y: baseButtonY });
              gsap.set(mist.scale, {
                x: MIST_COLLAPSED,
                y: MIST_COLLAPSED,
                z: MIST_COLLAPSED,
              });
              gsap.set(material, { opacity: 0 });
              sprayTl.pause(0);
            },
          },
        });

        // The press, and the spray it causes. Down sharply and back up slower,
        // so it reads as a finger releasing rather than a spring.
        sprayTl.to(
          button.position,
          {
            y: baseButtonY - height * PRESS,
            duration: PRESS_DOWN,
            ease: "power2.in",
            onStart: () => window.dispatchEvent(new Event(SPRAY_START_EVENT)),
          },
          UNCAP_START + UNCAP_DURATION,
        ).to(
          button.position,
          { y: baseButtonY, duration: PRESS_UP, ease: "power2.out" },
          UNCAP_START + SPRAY_AT,
        );

        // Guarantee the one-way event starts from a clean state.
        sprayTl.set(
          mist.scale,
          {
            x: MIST_COLLAPSED,
            y: MIST_COLLAPSED,
            z: MIST_COLLAPSED,
          },
          0,
        );
        sprayTl.set(material, { opacity: 0 }, 0);

        // The cloud expands away from the nozzle it is parked on, and fades in
        // fast and out slow across the same span — so the mist is thickest as it
        // leaves the spout and gone by the time it has travelled its length.
        sprayTl.to(
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
              onComplete: () =>
                window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT)),
            },
            UNCAP_START + SPRAY_AT + MIST_IN,
          );
      }

      // One-way spray mist event lifecycle is managed cleanly without cap collisions.
      ScrollTrigger.refresh();


      // The trigger above is built long after the page is — the model downloads
      // and parses first — so by now the beat's wrapper is back to being lifted
      // over the viewport, and `#ritual` would measure as the screen the Hero is
      // filling instead of the third screen of the stage. Everything else on the
      // page was measured inside the stage's own refresh, which drops every lift
      // for exactly this reason; one more refresh is what buys this trigger the
      // same honest position. Last, so nothing is added to the timeline after a
      // refresh has possibly played it.
      ScrollTrigger.refresh();
    },
    { dependencies: [enabled, ready, trigger] },
  );
}
