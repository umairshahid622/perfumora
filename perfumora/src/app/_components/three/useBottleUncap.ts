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
const LIFT = 1.25;
const PRESS = 0.08;

const UNCAP_DURATION = 0.45;
const STRAIGHTEN_DURATION = 0.2;
const UNCAP_START = STRAIGHTEN_DURATION;
const PRESS_DOWN = 0.1;
const PRESS_UP = 0.18;
const SPRAY_DURATION = 0.6;
/** How quickly the mist arrives once the button bottoms out. */
const MIST_IN = 0.12;
/** The cap's chase time while the showcase glide is being driven by scroll — short,
 *  so the cap tracks the wheel rather than lagging behind it. */
const CLOSE_CHASE = 0.15;
/** How long the cap takes to seat itself when the customer reverses back out of
 *  the showcase. Slower than the chase above because this one is a gesture rather
 *  than tracking: nothing is driving it, so it has to read as a movement. */
const RESEAT_DURATION = 0.25;

/** The instant the pump fires: the button has just bottomed out. */
const SPRAY_AT = UNCAP_DURATION + PRESS_DOWN;

/**
 * From the trigger to the mist having fully faded — the length of the spray's own
 * timeline, and therefore the shortest a complete Ritual can be. The journey's
 * speed is derived from this rather than picked (see `MAX_JOURNEY_RATE`).
 */
const SPRAY_TOTAL = UNCAP_START + SPRAY_AT + SPRAY_DURATION;

/** The screen the Ritual's journey begins on, and where the cap is fully shut. */
const RITUAL_FROM = 3.0;
const CLOSE_TO = 4.7;

/**
 * How fast the journey may advance through the Ritual, in screens per second.
 *
 * Derived, not chosen: the window is `RITUAL_FROM → CLOSE_TO` screens and the
 * mist takes `SPRAY_TOTAL` seconds, so this is the rate at which the two finish
 * together. At it, the cap opening, the mist and the cap closing fill the window
 * exactly and the close's gate on `sprayDone` has nothing left to wait for.
 *
 * This is the whole of the pacing guarantee. A slow scroll never reaches it and
 * is tracked exactly; a fast one is held to it, so the journey is traversed in
 * full however hard the customer flicks.
 */
const MAX_JOURNEY_RATE = (CLOSE_TO - RITUAL_FROM) / SPRAY_TOTAL;

/**
 * Where the hold engages, a hair before the Ritual itself.
 *
 * The page is free through the Hero and the Manifesto — a customer who wants to
 * skip the intro still can — and is taken over only here. The lead is what makes
 * the handover invisible: clamping on the exact frame the page crosses
 * `RITUAL_FROM` would have to pull it back by however far it travelled in that
 * frame, where engaging just before means it is already held when it arrives.
 */
const RITUAL_ENTRY = RITUAL_FROM - 0.08;

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

      let hasUncapped = false;
      let activeSprayTl: gsap.core.Timeline | null = null;
      /** Whether this pass has already told <Ritual> the close is done. The close
       *  is reached by a range of scroll positions rather than an instant, so
       *  without this the event fired on every wheel tick across it. */
      let hasAnnouncedClose = false;
      /**
       * The mist has finished. **The cap may not travel back down before this**,
       * and that gate is the whole of the fix for fast scrolling.
       *
       * Uncapping, spraying and closing are a *sequence*, but only the first two
       * are timed together — the third is placed by scroll position. On a fast
       * pass the customer crosses the close window while the spray is still in
       * the air, and the old controller took that as an instruction: the cap
       * glided shut over a spraying nozzle and then `kill()`ed the spray at 4.7,
       * truncating the mist entirely. Three things the eye reads as one gesture
       * were happening at once.
       *
       * Scroll now only *requests* the close. It is applied when the mist is done.
       */
      let sprayDone = false;
      /** Scroll has entered the close window. Remembered rather than acted on, so
       *  a fast pass that arrives there mid-spray still gets its close afterwards
       *  instead of losing it. */
      let closeRequested = false;
      /** The last screen and direction the controller saw, so a callback that is
       *  not itself a scroll update — the spray finishing — can still place the
       *  cap correctly. */
      let latestScreen = 0;
      let lastDirection = 1;
      /**
       * How far the customer *wants* to be — the furthest the page has been seen
       * to reach while heading down, and the position itself while heading back.
       *
       * This exists because of a trap that is easy to walk into: the hold below
       * clamps the page to the journey, and the ScrollTrigger reports the clamped
       * position. So if the journey chased `latestScreen` it would be chasing its
       * own output — the clamp would report "you are already where you wanted to
       * be", the distance would read zero, and the journey would stop dead with
       * the cap half open. Chasing the intent instead keeps the two separate: the
       * customer's wheel still says "five screens", and the journey takes its own
       * time getting there while the page is held at whatever it has reached.
       */
      let intentScreen = 0;
      /**
       * The journey's own position, which chases the intent at `MAX_JOURNEY_RATE`.
       *
       * Every zone below reads *this*, never the page directly. That is what makes
       * the sequence unskippable: the page can move as fast as it likes, but the
       * journey can only advance at the rate the mist needs, so the thresholds at
       * 3.0 / 3.9 / 4.7 are always crossed in order and never jumped.
       */
      let journeyScreen = 0;
      /**
       * Where the page had reached when the hold engaged, or `null` while it is
       * not holding.
       *
       * The hold never pulls the page *back*, and this is why. A fast page can
       * overshoot the window by a frame's travel before the hold notices, and
       * clamping it to the journey would drag it backwards by that much — a
       * visible jump at exactly the moment the customer was scrolling hardest.
       * Holding it *at* where it already is and letting the journey come up to
       * meet it reads as the page waiting instead.
       */
      let holdAnchor: number | null = null;

      /** Where the close begins, in screens of the opening stage. Its end is
       *  `CLOSE_TO`, which the pacing constants above also need. */
      const CLOSE_FROM = 3.9;

      /** Place the cap for the current scroll position within the close window,
       *  and announce the close once it is fully shut. */
      const applyClose = () => {
        const closeProgress = Math.min(
          1,
          Math.max(0, (journeyScreen - CLOSE_FROM) / (CLOSE_TO - CLOSE_FROM)),
        );
        gsap.to(cap.position, {
          y: baseCapY + height * LIFT * (1 - closeProgress),
          duration: CLOSE_CHASE,
          ease: "power1.out",
          overwrite: "auto",
        });

        if (closeProgress >= 1 && !hasAnnouncedClose) {
          hasAnnouncedClose = true;
          if (activeSprayTl) activeSprayTl.kill();
          resetSprayState();
          window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT));
        }
      };

      /** Seat the cap, unless it already is or a tween is carrying it there. */
      const seatCap = () => {
        if (
          !gsap.isTweening(cap.position) &&
          Math.abs(cap.position.y - baseCapY) > 0.0001
        ) {
          gsap.to(cap.position, {
            y: baseCapY,
            duration: still ? 0 : RESEAT_DURATION,
            ease: "power2.inOut",
            overwrite: "auto",
          });
        }
      };

      /**
       * Honour whatever the scroll asked for while the mist was still in the air.
       * Without this a fast pass would be left with a permanently open cap: the
       * scroll had already moved on, so no further `onUpdate` would come to
       * apply the close it had requested.
       */
      const settleAfterSpray = () => {
        if (closeRequested) applyClose();
        else if (lastDirection < 0) seatCap();
      };

      // Master Directional Ritual Controller:
      // - Downward entry (>= 3.0 screens): Cap smoothly un-caps, pump fires, mist sprays, sound plays, steps reveal.
      // - Inside Ritual runway (3.9 -> 4.7 screens): Cap smoothly glides shut.
      // - Upward scrolling (from Craft/Showcase through Ritual back to Hero): CAP STAYS CLOSED — and
      //   is actively seated rather than left wherever a reversed close tween stranded it.
      // - Upward exit into Manifesto (< 2.5 screens): Resets trigger so future downward passes uncap fresh.
      //
      // Two clocks, and keeping them apart is the whole design. The **page** is the
      // customer's — free through the Hero and the Manifesto, however fast they
      // like. The **journey** is the sequence's own, and it can only advance at
      // `MAX_JOURNEY_RATE`, which is the speed the mist needs. Every zone below
      // reads the journey, never the page.
      //
      // That is what makes the sequence unskippable. The page can jump five screens
      // in a flick; the journey still crosses 3.0, then 3.9, then 4.7 in order, so
      // the cap opens, the mist sprays and the cap closes in sequence every time.
      // A slow scroll never reaches the rate and is tracked exactly.
      const controller = ScrollTrigger.create({
        trigger: stageEl,
        start: "top top",
        end: () => `+=${window.innerHeight * 5}`,
        // Records only. Nothing is driven from here — see the ticker below.
        onUpdate: (self) => {
          latestScreen = self.progress * 5;
          lastDirection = self.direction;
          // The intent, captured before the hold can clamp the page back. On the
          // way down it only ever grows, so a flick that overshoots is not
          // forgotten when the clamp pulls the page back to the journey.
          if (self.direction > 0) {
            if (latestScreen > intentScreen) intentScreen = latestScreen;
          } else {
            intentScreen = latestScreen;
          }
        },
      });

      /**
       * The zone ladder, evaluated against the journey's position.
       *
       * `direction` is the direction the *journey* is travelling, which is what the
       * zones should branch on: when the page reverses, the journey reverses too,
       * and it is the journey that has to be seated or re-opened.
       */
      const evaluate = (screen: number, direction: number) => {
        const isScrollingDown = direction > 0;
        const isScrollingUp = direction < 0;

        // Zone 1: Upward Reset Zone (< 2.5 screens into Manifesto / Hero)
        if (screen < 2.5) {
          if (hasUncapped) {
            hasUncapped = false;
            hasAnnouncedClose = false;
            sprayDone = false;
            closeRequested = false;
            if (activeSprayTl) activeSprayTl.kill();
            resetSprayState();
            gsap.to(cap.position, {
              y: baseCapY,
              duration: still ? 0 : RESEAT_DURATION,
              ease: "power2.inOut",
              overwrite: "auto",
            });
            window.dispatchEvent(new Event(SPRAY_RESET_EVENT));
          }
          return;
        }

        // Zone 2: Uncap & Mist Spray Trigger (>= 3.0 screens when bottle has drifted to Ritual)
        if (screen >= RITUAL_FROM && !hasUncapped && isScrollingDown) {
          hasUncapped = true;
          hasAnnouncedClose = false;
          // A fresh pass: nothing has been sprayed yet, and no close is owed.
          sprayDone = false;
          closeRequested = false;

          // 1. Gentle momentum dampening during mist theatre
          if (
            typeof window !== "undefined" &&
            (window as unknown as { lenis?: { velocity?: number } }).lenis
          ) {
            const lenis = (
              window as unknown as { lenis?: { velocity?: number } }
            ).lenis;
            if (
              lenis &&
              typeof lenis.velocity === "number" &&
              Math.abs(lenis.velocity) > 1.2
            ) {
              lenis.velocity *= 0.35;
            }
          }

          // 2. Lift cap smoothly
          gsap.to(cap.position, {
            y: baseCapY + height * LIFT,
            duration: still ? 0 : UNCAP_DURATION,
            ease: "power2.out",
            overwrite: "auto",
          });

          if (still || !button || !mist || !material) {
            resetSprayState();
            // Nothing will spray, so the cap is free to move straight away.
            sprayDone = true;
            window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT));
            return;
          }

          if (activeSprayTl) activeSprayTl.kill();
          resetSprayState();

          activeSprayTl = gsap.timeline({
            onComplete: () => {
              // The gate lifts here, and anything the scroll asked for while
              // the mist was in the air is applied in the same breath.
              sprayDone = true;
              window.dispatchEvent(new Event(SPRAY_COMPLETE_EVENT));
              settleAfterSpray();
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
          return;
        }

        // Zone 3: Cap Closing inside Ritual (3.9 -> 4.7 screens)
        if (hasUncapped) {
          if (screen >= CLOSE_FROM && isScrollingDown) {
            // Requested, not performed. The journey says where it wants the cap;
            // `sprayDone` says whether it is allowed to go there yet.
            closeRequested = true;
            if (sprayDone) applyClose();
          } else if (isScrollingUp) {
            // Reversing out of the showcase. The close is a *timed* tween chasing
            // the journey, so a reversal used to catch it mid-glide and merely
            // `killTweensOf` it — freezing the cap wherever it happened to be,
            // partway up, with no spray behind it. Seating it is what the comment
            // above promises, guarded on `isTweening` so the tween is started once
            // and allowed to finish rather than restarted on every tick.
            //
            // The same ordering rule as the close, reversed: a cap coming down over
            // a spray that is still in the air is the same conflict seen backwards,
            // so this waits for the mist too.
            closeRequested = false;
            if (sprayDone) seatCap();
          }
        }
      };

      /**
       * One tick of the journey: advance it toward the page, evaluate the zones
       * there, and hold the page back while the Ritual is running.
       */
      const tick = (_time: number, deltaMs: number) => {
        const dt = Math.min(deltaMs / 1000, 0.05);
        const delta = intentScreen - journeyScreen;

        // Only *forward*, and only inside the Ritual. Below `RITUAL_ENTRY` the
        // journey tracks the page exactly, so it arrives at the window the moment
        // the page does — rate-limiting it from zero would leave it lagging the
        // Hero and the hold below would then have to drag the page back to it.
        // Reversing is unlimited too: the customer is leaving, and making them
        // wait out the cap's reverse would only feel like lag.
        const limiting =
          delta > 0 && journeyScreen >= RITUAL_ENTRY && journeyScreen < CLOSE_TO;

        if (Math.abs(delta) > 0.0005) {
          let step =
            Math.sign(delta) *
            Math.min(Math.abs(delta), (limiting ? MAX_JOURNEY_RATE : Infinity) * dt);

          // Never overshoot the window's entrance. A flick can carry the journey
          // from below `RITUAL_ENTRY` to past `CLOSE_TO` in a single tick, and
          // because `limiting` is read *before* the step that tick would run at
          // full speed and skip the whole sequence. Stopping it exactly on the
          // threshold means the next tick is inside the window, where the limit
          // applies — so the journey can only ever enter the Ritual at its own
          // pace, however hard the page arrived.
          if (
            delta > 0 &&
            journeyScreen < RITUAL_ENTRY &&
            journeyScreen + step > RITUAL_ENTRY
          ) {
            step = RITUAL_ENTRY - journeyScreen;
          }

          journeyScreen += step;
          evaluate(journeyScreen, Math.sign(delta));
        } else {
          journeyScreen = intentScreen;
        }

        // The hold. Once the page has reached the Ritual it may not outrun the
        // journey, so the sequence is seen rather than skipped — but it is held
        // *at* where it already is, never dragged back behind it. See `holdAnchor`.
        //
        // Released at `CLOSE_TO`, where the journey is done and the stage is free
        // to leave as it always did. Only on the way *down*: reversing is the
        // customer changing their mind, and braking them out of it would be the
        // opposite of helpful.
        const holding =
          delta > 0 && journeyScreen >= RITUAL_ENTRY && journeyScreen < CLOSE_TO;

        if (holding) {
          if (holdAnchor === null) holdAnchor = latestScreen;
          const allowed =
            controller.start +
            Math.max(journeyScreen, holdAnchor) * window.innerHeight;
          if (window.scrollY > allowed + 1) {
            const lenis = (
              window as unknown as {
                lenis?: { scrollTo?: (y: number, o?: object) => void };
              }
            ).lenis;
            if (lenis && typeof lenis.scrollTo === "function") {
              // `immediate` because this is a correction, not a journey of its
              // own — animating it would fight the customer's own easing.
              lenis.scrollTo(allowed, { immediate: true, force: true });
            } else {
              window.scrollTo({ top: allowed });
            }
          }
        } else {
          holdAnchor = null;
        }
      };

      gsap.ticker.add(tick);

      ScrollTrigger.refresh();

      return () => {
        gsap.ticker.remove(tick);
      };
    },
    { dependencies: [enabled, ready, trigger] },
  );
}
