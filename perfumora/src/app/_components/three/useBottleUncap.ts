"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Box3, Vector3, type Object3D } from "three";
import { prefersReducedMotion } from "../../_lib/motion";
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

const UNCAP_DURATION = 0.7;
const PRESS_DOWN = 0.12;
const PRESS_UP = 0.22;
const SPRAY_DURATION = 0.9;
/** How quickly the mist arrives once the button bottoms out. */
const MIST_IN = 0.18;

/** The instant the pump fires: the button has just bottomed out. */
const SPRAY_AT = UNCAP_DURATION + PRESS_DOWN;

/**
 * When the Ritual's three steps may start arriving, in seconds from the top of
 * this choreography — the cue they wait on, exported so the two halves of one
 * sequence cannot drift apart. The steps live in the DOM and the spray in the
 * canvas, so there is no timeline that can hold both.
 *
 * Set a beat past the mist's peak rather than past its last droplet: the spray
 * has plainly happened by then, and waiting for the cloud to clear entirely
 * would stall the beat for the better part of two seconds before a word of it
 * could be read.
 */
export const RITUAL_STEPS_DELAY = SPRAY_AT + MIST_IN + 0.1;

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
 * It plays on entry from either direction, so arriving at the beat from the
 * Craft below shows the same thing as arriving from the Manifesto above, and
 * reverses only off the top — where the beat is genuinely being left behind and
 * the bottle has to be whole again for the two beats that come before it.
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
  const initialCapY = useRef<number | null>(null);
  const initialButtonY = useRef<number | null>(null);

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

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger,
          start: "top top",
          end: "bottom top",
          // `play` on the way back in as well: `none` there would leave the
          // bottle capped and the steps unread for anyone scrolling up from the
          // Craft, since the timeline is only ever reversed off the top.
          toggleActions: "play none play reverse",
        },
      });

      tl.to(
        cap.position,
        {
          y: baseCapY + height * LIFT,
          duration: still ? 0 : UNCAP_DURATION,
          ease: "power2.out",
        },
        0,
      );

      const button = refs.pumpButton.current;
      const mist = refs.mist.current;
      const material = refs.mistMaterial.current;

      if (!still && button && mist && material) {
        if (initialButtonY.current === null) {
          initialButtonY.current = button.position.y;
        }
        const baseButtonY = initialButtonY.current;

        // The press, and the spray it causes. Down sharply and back up slower,
        // so it reads as a finger releasing rather than a spring.
        tl.to(
          button.position,
          {
            y: baseButtonY - height * PRESS,
            duration: PRESS_DOWN,
            ease: "power2.in",
          },
          UNCAP_DURATION,
        ).to(
          button.position,
          { y: baseButtonY, duration: PRESS_UP, ease: "power2.out" },
          SPRAY_AT,
        );

        // Guarantee initial state is reset on reverse
        tl.set(
          mist.scale,
          {
            x: MIST_COLLAPSED,
            y: MIST_COLLAPSED,
            z: MIST_COLLAPSED,
          },
          0,
        );
        tl.set(material, { opacity: 0 }, 0);

        // The cloud expands away from the nozzle it is parked on, and fades in
        // fast and out slow across the same span — so the mist is thickest as it
        // leaves the spout and gone by the time it has travelled its length.
        tl.to(
          mist.scale,
          { x: 1, y: 1, z: 1, duration: SPRAY_DURATION, ease: "power2.out" },
          SPRAY_AT,
        )
          .to(
            material,
            { opacity: MIST_OPACITY, duration: MIST_IN, ease: "power1.out" },
            SPRAY_AT,
          )
          .to(
            material,
            {
              opacity: 0,
              duration: SPRAY_DURATION - MIST_IN,
              ease: "power1.in",
            },
            SPRAY_AT + MIST_IN,
          );
      }

      // Showcase scrubbed timeline: as scroll advances past the steps, close the cap
      // and tilt/rotate the bottle to the dramatic showcase angle seen in the reference.
      const tiltGroup = refs.tiltGroup.current;
      if (tiltGroup) {
        gsap.set(tiltGroup.rotation, { x: 0, y: 0, z: 0 });
      }

      const showcaseTl = gsap.timeline({
        scrollTrigger: {
          trigger,
          start: () => "top+=" + Math.round(window.innerHeight * 0.7) + " top",
          end: () => "top+=" + Math.round(window.innerHeight * 1.5) + " top",
          scrub: 1,
        },
      });

      showcaseTl.fromTo(
        cap.position,
        { y: baseCapY + height * LIFT },
        { y: baseCapY, ease: "power2.inOut", immediateRender: false },
        0,
      );

      if (!still && tiltGroup) {
        showcaseTl.to(
          tiltGroup.rotation,
          {
            x: 0.1,
            y: 0.35,
            z: 0.28,
            ease: "power2.inOut",
          },
          0,
        );
      }

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
