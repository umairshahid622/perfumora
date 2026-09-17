"use client";

import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Box3, Vector3, type Object3D } from "three";
import { prefersReducedMotion } from "../../_lib/motion";
import { useSoundCue } from "../../_hooks/useSoundCue";
import { MIST_OPACITY } from "./BottleMist";
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
const SPRAY_DURATION = 1.14;
/** How quickly the mist arrives once the button bottoms out. */
const MIST_IN = 0.16;
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

      if (refs.pumpButton.current && initialButtonY.current === null) {
        initialButtonY.current = refs.pumpButton.current.position.y;
      }
      const baseButtonY = initialButtonY.current ?? 0;

      // Clean state helper for spray effects
      const resetSprayState = () => {
        const liveButton = refs.pumpButton.current;
        const liveMist = refs.mist.current;
        const liveMaterial = refs.mistMaterial.current;
        if (liveButton) gsap.set(liveButton.position, { y: baseButtonY });
        if (liveMist) {
          gsap.set(liveMist.scale, { x: 1, y: 1, z: 1 });
          liveMist.userData.sprayTime = 0;
          liveMist.userData.isAutonomous = false;
          liveMist.userData.isSpraying = false;
        }
        if (liveMaterial) gsap.set(liveMaterial, { opacity: 0 });
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
      /**
       * Whether the cap is off the bottle right now, and therefore owed a close.
       *
       * `applyClose` places the cap on an *absolute* curve — `1 - closeProgress`,
       * which is fully open at `CLOSE_FROM` and shut at `CLOSE_TO`. So it can only
       * be applied while the cap is genuinely open.
       *
       * `hasUncapped` cannot stand in for that. It stays true from the moment the
       * Ritual fires until the journey drops back below 2.5, so a customer who
       * scrolls up from the Gallery into the Ritual and then straight back down
       * re-enters the close window with a *seated* cap while `hasUncapped` is still
       * set. The close then snaps the cap open on its way to shutting it — a flap
       * with no spray behind it, on a pass that never uncapped. That is the "cap
       * opens and closes in a very short frame" report.
       */
      let capLifted = false;
      /** The last screen and direction the controller saw, so a callback that is
       *  not itself a scroll update — the spray finishing — can still place the
       *  cap correctly. */
      let latestScreen = 0;
      let lastDirection = 1;
      /**
       * Whether the hold is running — `null` when it is not, and the end of the
       * sequence while it is.
       *
       * It is always `CLOSE_TO`, and that is the point: the hold exists to play
       * the Ritual for someone who scrolled past it, so its destination is the end
       * of the sequence by definition. A nearer destination guessed from how far
       * the customer had got would not be an intention — the hold clamps the page
       * a frame later, so anything read at that moment is a frame of scroll rather
       * than a plan, and the journey would stop a third of the way in.
       */
      let holdTo: number | null = null;

      /**
       * How far ahead the page has to get inside the Ritual before the hold is
       * taken, in screens. Small enough that a fast page is caught promptly, large
       * enough that an ordinary scroll — whose page leads the journey by about a
       * frame's travel — never trips it.
       */
      const LATCH_GAP = 0.12;
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
          // Fully shut again, so the next pass is free to lift it from scratch.
          capLifted = false;
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
        else if (lastDirection < 0) {
          seatCap();
          capLifted = false;
        }
      };

      // Master Directional Ritual Controller:
      // - Downward entry (>= 3.0 screens): Cap smoothly un-caps, pump fires, mist sprays, sound plays, steps reveal.
      // - Inside Ritual runway (3.9 -> 4.7 screens): Cap smoothly glides shut — but only if this pass actually
      //   uncapped it (`capLifted`). Re-entering the window from above with the cap already shut must do nothing,
      //   or the close snaps the cap open on its way to closing it.
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
        },
      });

      /** Put the page at a document offset, through Lenis when it is driving. */
      const setScroll = (top: number) => {
        const lenis = (
          window as unknown as {
            lenis?: { scrollTo?: (y: number, o?: object) => void };
          }
        ).lenis;
        if (lenis && typeof lenis.scrollTo === "function") {
          // `immediate` because this is the hold placing the page, not a journey
          // of its own — animating it would fight Lenis's own easing.
          lenis.scrollTo(top, { immediate: true, force: true });
        } else {
          window.scrollTo({ top });
        }
      };

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
            capLifted = false;
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
          // The cap is now off, so a close is owed and may be applied. Set before
          // the early return below, which also leaves the cap lifted.
          capLifted = true;

          const liveButton = refs.pumpButton.current;
          const liveMist = refs.mist.current;
          const liveMaterial = refs.mistMaterial.current;

          if (still || !liveButton || !liveMist || !liveMaterial) {
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
              liveButton.position,
              {
                y: baseButtonY - height * PRESS,
                duration: PRESS_DOWN,
                ease: "power2.in",
                onStart: () => window.dispatchEvent(new Event(SPRAY_START_EVENT)),
              },
              UNCAP_START + UNCAP_DURATION,
            )
            .to(
              liveButton.position,
              { y: baseButtonY, duration: PRESS_UP, ease: "power2.out" },
              UNCAP_START + SPRAY_AT,
            );

          // Mist spray projectile physics & sound cue
          activeSprayTl
            .to(
              liveMist.userData,
              {
                sprayTime: SPRAY_DURATION,
                duration: SPRAY_DURATION,
                ease: "none",
                onStart: () => {
                  liveMist.userData.sprayTime = 0;
                  liveMist.userData.isSpraying = true;
                  playSprayRef.current();
                },
              },
              UNCAP_START + SPRAY_AT,
            )
            .to(
              liveMaterial,
              { opacity: MIST_OPACITY, duration: MIST_IN, ease: "power1.out" },
              UNCAP_START + SPRAY_AT,
            )
            .to(
              liveMaterial,
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
          if (screen >= CLOSE_FROM && isScrollingDown && capLifted) {
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
            if (sprayDone) {
              seatCap();
              capLifted = false;
            }
          }
        }
      };

      /**
       * One tick of the journey. Two modes, and only ever one of them:
       *
       *   - **Holding** — latched. The journey runs to the destination captured
       *     when the hold was taken, and the page is driven to wherever the journey
       *     has got to.
       *   - **Free** — the journey follows the page, capped at the bounded rate
       *     inside the Ritual. A customer simply scrolling lives here, and a fast
       *     one is caught here: once the page has genuinely outrun the journey,
       *     the hold is taken.
       */
      const tick = (_time: number, deltaMs: number) => {
        const dt = Math.min(deltaMs / 1000, 0.05);

        // ---- holding ------------------------------------------------------
        if (holdTo !== null) {
          journeyScreen = Math.min(holdTo, journeyScreen + MAX_JOURNEY_RATE * dt);
          evaluate(journeyScreen, 1);

          // **Driven, not corrected.** Setting the position only once the page had
          // run ahead made the hold a series of corrections: the customer's wheel
          // pushed the page forward, this snapped it back, and the two alternated
          // frame by frame — a sawtooth that read as stutter, and worse the faster
          // they scrolled. Following the journey every frame is what makes the hold
          // smooth: the page moves at exactly the journey's rate, so there is never
          // anything left to correct.
          //
          // The half-pixel deadband only stops a settled page being written to
          // sixty times a second.
          const allowed =
            controller.start +
            Math.max(journeyScreen, holdAnchor ?? journeyScreen) *
              window.innerHeight;
          if (Math.abs(window.scrollY - allowed) > 0.5) setScroll(allowed);

          if (journeyScreen >= holdTo - 0.0005) {
            holdTo = null;
            holdAnchor = null;
          }
          return;
        }

        // ---- free ---------------------------------------------------------
        const delta = latestScreen - journeyScreen;
        if (Math.abs(delta) <= 0.0005) {
          journeyScreen = latestScreen;
          return;
        }

        const inWindow = journeyScreen >= RITUAL_ENTRY && journeyScreen < CLOSE_TO;
        let step = delta;
        if (delta > 0 && inWindow) step = Math.min(delta, MAX_JOURNEY_RATE * dt);

        // Never overshoot the window's entrance. A flick can carry the journey
        // from below `RITUAL_ENTRY` to past `CLOSE_TO` in a single tick, and
        // because `inWindow` is read *before* the step that tick would run at full
        // speed and skip the whole sequence. Stopping it exactly on the threshold
        // means the next tick is inside the window, where the limit applies — so
        // the journey can only ever enter the Ritual at its own pace, however hard
        // the page arrived.
        if (
          delta > 0 &&
          journeyScreen < RITUAL_ENTRY &&
          journeyScreen + step > RITUAL_ENTRY
        ) {
          step = RITUAL_ENTRY - journeyScreen;
        }

        journeyScreen += step;
        evaluate(journeyScreen, Math.sign(delta));

        // Take the hold, once the page has genuinely outrun the journey inside the
        // window — the one case that would otherwise skip the sequence. A gap of a
        // frame's travel is just the customer scrolling; a gap this size is the
        // journey being left behind.
        //
        // The destination is always the end of the sequence, and that is the whole
        // point: the customer scrolled past the Ritual, so the Ritual is played for
        // them rather than skipped. Trying to guess a nearer destination from how
        // far they had got at this instant does not work — the hold is about to
        // clamp the page, so their ask stops being readable a frame later, and a
        // destination read here would be one frame of scroll rather than an
        // intention.
        if (
          !still &&
          delta > 0 &&
          inWindow &&
          latestScreen - journeyScreen > LATCH_GAP
        ) {
          holdTo = CLOSE_TO;
          holdAnchor = latestScreen;
          // Freeze Lenis here in the same breath. Without this it keeps easing
          // toward the target it was given, moves the page on before the next
          // tick's hold can place it, and the first frame of the hold shows as a
          // step backwards by however far it travelled.
          setScroll(controller.start + latestScreen * window.innerHeight);
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
