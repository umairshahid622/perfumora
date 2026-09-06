"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Hero } from "../hero/Hero";
import { PersistentBottle } from "../three/PersistentBottle";
import { Manifesto } from "./Manifesto";
import { Ritual } from "./Ritual";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * The opening stage: the Hero, the Manifesto and the Ritual, dissolved between rather
 * than scrolled between (§4.1 → §4.3).
 *
 * The page holds still for the first three beats, and so does the Hero. All three panels
 * are `sticky` at the top of a stage four screens tall, stacked one over the other, and
 * the wheel drives a *changeover of the words* rather than a journey: the Hero's
 * oversized fragrance name fades out as the Manifesto's copy slides in from the left
 * over it, then the Manifesto leaves the way it came and the Ritual arrives in its place
 * on the same curve. Neither overlay brings a surface of its own — both are transparent
 * — so the parchment, the accent glow, the vessel, the arrows, the counter, the price
 * and Add to Bag are all still there underneath and still live, for all three beats. One
 * layer of text takes over from another in the same space; the only thing that moves is
 * the copy, and it moves 80px, so there is no parallax and no drift to reconcile.
 *
 * Four screens, each one doing a job:
 *
 *   0 → 1  The Manifesto arrives. Every panel is stuck at the top; the watermark goes,
 *          the Manifesto slides in and fades up, and the vessel steps right — all
 *          scrubbed, so the customer's own wheel is the transport.
 *   1 → 2  The changeover. The Manifesto fades out to the left, exactly reversing its
 *          own entrance, while the Ritual fades in from the left in its place and the
 *          vessel comes back to the middle.
 *   2 → 3  The Ritual, held. It is stuck on its own now and dead still, which is the
 *          same stillness every other beat gets while it is being read.
 *   3 → 4  The release. All three panels un-stick together — they are the same height,
 *          so they leave on the same pixel — and the stage scrolls away as one block
 *          with the Craft coming up beneath it. Ordinary scrolling from here down.
 *
 * Scrolling back up runs every one of those tweens in reverse, so each layer of copy
 * leaves to the left the way it came, with no second animation and no direction to
 * detect.
 *
 * Nothing in either overlay takes pointer events, at any point in that sequence, and the
 * rule is stated on each beat's *holder* rather than on the lifted wrapper inside it —
 * the holder is the box that does the covering. It is a screen tall and it paints above
 * the Hero's holder (later positioned sibling, all `sticky`), so it answers the hit test
 * for everything behind it: first the product bar it covers from the bottom while a
 * dissolve runs, then the whole Hero once it sticks. Transparency does not exempt it.
 * With `pointer-events-none` there and inherited downward you can step the scent, change
 * the size and add to the bag while reading either layer of prose; without it every
 * button in the Hero is dead from the first pixel of scroll. The price is that neither
 * overlay's own copy is selectable, which is the right way round for words laid over a
 * live product.
 *
 * The lift is the one piece of machinery, and there is one per overlay. For a dissolve to
 * be visible the arriving panel has to be on screen during the screen of scroll *before*
 * its own place in the document — so its wrapper is `fixed` over the viewport until its
 * own sticky reaches the top, and handed back to `absolute` half a screen after that,
 * inside the stretch where the two describe the same rectangle. The switch is invisible
 * by construction rather than by a matched pair of numbers, and the half-screen of slack
 * is what keeps it invisible on the way *up*, where a late switch is the one thing in
 * this stage that can jump. The Manifesto's is handed back at 1.5 screens, the Ritual's
 * at 2.5.
 *
 * The bottle rides inside the Ritual's wrapper — the last of the three, so the glass
 * paints over both layers of copy rather than under one of them — and that is what makes
 * it leave with the stage rather than with scroll logic of its own: it is nailed to the
 * viewport for as long as that wrapper is lifted or stuck, then travels off with the
 * block. Its one move across the three beats is the drift, 19vw right on the Manifesto's
 * own curve and window and back to 0 on the Ritual's, so the glass is centred for the two
 * beats composed on the middle of the screen and stepped aside for the one that puts a
 * column of prose in the left third.
 *
 * The Hero's own furniture stays where it was through all of this, the counter and the
 * product bar included. They belong to the section underneath, which by design does not
 * move while it is being read over; the consequence is that the counter does not sit
 * beneath the vessel while the Manifesto's drift is standing.
 */
export function OpeningStage() {
  const stage = useRef<HTMLDivElement>(null);
  const heroHolder = useRef<HTMLDivElement>(null);
  const manifestoLift = useRef<HTMLDivElement>(null);
  const manifestoPanel = useRef<HTMLDivElement>(null);
  const ritualLift = useRef<HTMLDivElement>(null);
  const ritualPanel = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const stageEl = stage.current;
      const heroEl = heroHolder.current;
      const manifestoLiftEl = manifestoLift.current;
      const manifestoPanelEl = manifestoPanel.current;
      const ritualLiftEl = ritualLift.current;
      const ritualPanelEl = ritualPanel.current;
      if (
        !stageEl ||
        !heroEl ||
        !manifestoLiftEl ||
        !manifestoPanelEl ||
        !ritualLiftEl ||
        !ritualPanelEl
      ) {
        return;
      }

      // How far a panel travels to arrive: 80px, which is the Manifesto copy's own
      // indent, so a block slides in by exactly the distance it is inset by. The fade
      // alone read as an apparition; with this it enters *from* somewhere. Scrolling up
      // runs the same tween backwards, so it leaves the way it came — out to the left —
      // with no second animation and no direction to detect. Both overlays use the one
      // value, so the two arrivals are the same gesture rather than two similar ones.
      //
      // Opacity is not conditional but the travel is: a fade is legible to someone who
      // has asked for less motion, a slide is the thing they asked to be spared. Zero
      // makes the tween a no-op on the x axis rather than a special case below.
      const slide = prefersReducedMotion() ? 0 : -80;

      // Both dissolves' start state belongs to GSAP rather than to a class: with the
      // script gone the overlays should still be readable sections in their resting
      // places instead of invisible ones shifted off their measures. `useGSAP` runs
      // before paint, so nothing flashes. Their inertness is the holders'
      // `pointer-events`, stated in the markup where it can be seen.
      gsap.set([manifestoPanelEl, ritualPanelEl], { opacity: 0, x: slide });

      // The watermark's presence and the vessel's drift, as unitless progress on the
      // stage element. GSAP writes the number below; CSS owns what the number means —
      // `--name-presence` multiplies the fragrance name's own opacity, `--vessel-drift`
      // multiplies a 19vw step inside an `md:` utility. That split is what lets the drift
      // be desktop-only without a media query in here, and lets a resize re-resolve the
      // distance with no refresh.
      gsap.set(stageEl, { "--name-presence": 1, "--vessel-drift": 0 });

      /**
       * Hold one overlay's wrapper over the viewport until its own sticky reaches the
       * top, then hand it back to the flow. `screens` is how many screens of scroll that
       * takes — one for the Manifesto, two for the Ritual — measured off the Hero
       * holder's height rather than restated as `100vh`, because on a phone those are
       * not the same number, and two statements of one offset is how a handover jumps.
       *
       * Handed back half a screen *after* that, though, and the half-screen is the point.
       * The two positions describe the same rectangle for as long as the holder is stuck
       * — from this beat's own screen all the way to the release — so the switch is
       * invisible anywhere inside that window, but it is only *safe* late. Scrolling up,
       * the switch back to `fixed` has to have landed before the holder un-sticks, or the
       * panel paints low by exactly the scroll the toggle lagged by: measured 1:1, so
       * 240px of lag is a 240px jump, and in the Ritual's wrapper the vessel jumps with
       * it. Scrolling down the same lag costs nothing, the holder being stuck already —
       * which is why the jerk only ever showed on the way up. Half a screen puts the
       * switch far enough inside the window that no plausible lag reaches the edge of it.
       * The room to spend is the stage's fourth screen: the Ritual's handover lands at
       * 2.5 screens and the release is at 3.
       *
       * Returns its own teardown, because every other ScrollTrigger on the page reads
       * these sections' positions in the document — the nav's tone handover, the
       * `#manifesto` and `#ritual` anchors, each heading's own reveal. While a wrapper is
       * lifted, `getBoundingClientRect` answers with the viewport, which would key all of
       * them to the Hero's screen. So the lift is dropped for the length of a refresh and
       * restored once every trigger has been measured; both events fire inside one frame,
       * so nothing paints in between.
       */
      const lift = (el: HTMLDivElement, screens: number) => {
        const settle = (lifted: boolean) =>
          gsap.set(el, { position: lifted ? "fixed" : "absolute" });

        // Progress, not `isActive`. ScrollTrigger reports a trigger inactive at progress
        // 0 exactly as it does at 1, and progress 0 is scroll 0 — the one place the lift
        // matters most, since dropping it there parks the panel a screen below the fold.
        const isLifted = (self: ScrollTrigger) => self.progress < 1;

        const st = ScrollTrigger.create({
          trigger: stageEl,
          start: "top top",
          end: () => `+=${heroEl.offsetHeight * (screens + 0.5)}`,
          onToggle: (self) => settle(isLifted(self)),
        });

        const drop = () => settle(false);
        const restore = () => settle(isLifted(st));
        ScrollTrigger.addEventListener("refreshInit", drop);
        ScrollTrigger.addEventListener("refresh", restore);

        return () => {
          ScrollTrigger.removeEventListener("refreshInit", drop);
          ScrollTrigger.removeEventListener("refresh", restore);
        };
      };

      // Both changeovers on one timeline and one trigger, two screens long, so a single
      // playhead owns every property across both beats. Two timelines over adjacent
      // windows would each claim the Manifesto's opacity and the vessel's drift, and on a
      // refresh ScrollTrigger renders them in start order — the later one stamping its own
      // start values over the earlier one's mid-dissolve state.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stageEl,
          start: "top top",
          end: () => `+=${heroEl.offsetHeight * 2}`,
          scrub: true,
        },
      });

      // One duration and one ease for every arrival and departure, so the beats are
      // literally the same curve rather than curves that happen to match.
      const beat = { ease: "power1.inOut", duration: 1 };

      tl
        // Beat one: the Manifesto arrives and the watermark goes. Not from the first
        // pixel — for the first fifth the Hero is untouched, then the name leaves, and it
        // is gone by the halfway point, where the copy crosses half opacity and becomes
        // properly readable. One event rather than a slow erase and an unrelated fade.
        .to(manifestoPanelEl, { opacity: 1, x: 0, ...beat }, 0)
        .to(
          stageEl,
          { "--name-presence": 0, ease: "power1.inOut", duration: 0.3 },
          0.2,
        )
        // The vessel travels with the copy, on the copy's own curve and window, so the
        // two read as one move. Both halves of the composition step right — the glass
        // further than the prose, which is where the air between them comes from — by
        // amounts symmetric about one midpoint, so the pair still reads centred. Not
        // gated on reduced motion, unlike the entry slide: this is where the vessel
        // *belongs* during the beat, not an ornament on the way there.
        .to(stageEl, { "--vessel-drift": 1, ...beat }, 0)
        // Beat two: the Manifesto's entrance played backwards — out to the left, the way
        // it came — under the Ritual arriving on the identical tween, so the changeover
        // is one crossfade in one place, not two blocks moving past each other.
        .to(manifestoPanelEl, { opacity: 0, x: slide, ...beat }, 1)
        .to(ritualPanelEl, { opacity: 1, x: 0, ...beat }, 1)
        // And the glass comes back to the middle, the Ritual being composed on the centre
        // of the screen again. Returning the progress to 0 rather than restating a
        // distance is what makes the return exact at every width: the 19vw only ever has
        // to cancel against itself.
        .to(stageEl, { "--vessel-drift": 0, ...beat }, 1);

      const teardowns = [lift(manifestoLiftEl, 1), lift(ritualLiftEl, 2)];

      // The nav's triggers are built in the layout, before this stage exists, so they
      // were measured against panels that were already lifted. One refresh with the
      // three above in place is what puts them on the honest position — and it is also
      // what gives each lift its first `position` for the current scroll.
      ScrollTrigger.refresh();

      return () => teardowns.forEach((off) => off());
    },
    { scope: stage },
  );

  return (
    <div ref={stage} className="relative h-[400vh]">
      {/* Stuck for the first three screens of the stage, so the Hero is still on screen
          underneath while it is being covered — twice over. */}
      <div ref={heroHolder} className="sticky top-0 h-screen">
        <Hero />
      </div>

      {/* The Manifesto's own screen of the document — the second one, which is what
          keeps the nav's tone handover and the `#manifesto` anchor honest. The same
          height as the Hero's holder, so every panel releases on the same pixel.

          `pointer-events-none` is stated here, on the outermost box of the beat, because
          this is the box that does the covering: a full screen tall, painting above the
          Hero's holder (later positioned sibling, both `sticky`), so from the moment it
          rises into the viewport it answers the hit test for everything behind it —
          first the product bar it covers from the bottom during the dissolve, then the
          whole Hero once it sticks. Being transparent does not exempt it. Nothing in this
          beat is ever meant to be clicked, so the rule is stated once here and inherited
          by the lift rather than repeated on it. */}
      <div className="pointer-events-none sticky top-0 h-screen">
        {/* Lifted over the viewport for the first screen of scroll, while the dissolve
            runs. `z-30` carries the panel above the Hero's own furniture (z-10, z-20) and
            leaves it under the nav — and under the Ritual's wrapper below, which carries
            the same z-30 and is the later sibling.

            `overflow-hidden` keeps the panel to the screen it occupies: it holds a
            full-height section inside a box that is `fixed` for that screen, and it is
            the box the 80px entry slide happens in. */}
        <div ref={manifestoLift} className="absolute inset-0 z-30 overflow-hidden">
          <div ref={manifestoPanel} className="h-full">
            <Manifesto />
          </div>
        </div>
      </div>

      {/* The Ritual's screen — the third — and the same beat over again: a transparent
          overlay on the same live Hero, arriving on the same slide and fade the Manifesto
          did, inert for the same reason. */}
      <div className="pointer-events-none sticky top-0 h-screen">
        {/* Lifted for the first two screens of scroll. The vessel rides in here rather
            than in the Manifesto's wrapper because this is the last of the three, so its
            z-30 paints over both layers of copy — the glass in front of the words, which
            is the order the phone layout needs, where neither block has an indent and
            both are laid over it. Sharing a wrapper with a panel is also what gives the
            bottle its whole lifecycle for free: nailed to the viewport for as long as
            this box is lifted or stuck, then away with the stage. */}
        <div ref={ritualLift} className="absolute inset-0 z-30 overflow-hidden">
          <div ref={ritualPanel} className="h-full">
            <Ritual />
          </div>

          {/* The vessel's drift lane. GSAP owns only `--vessel-drift`, 0 → 1 → 0; the
              distance is stated here, once. `md:` is doing real work — below it neither
              overlay's copy has an indent and both are laid over the glass, so there is
              nothing to step aside for. The number is the far half of a pair with the
              Manifesto copy's own `md:ml-[calc(5rem_+_13vw)]`: 19 and 13 straddle 16vw,
              their midpoint is what holds the composition centred, and their 6vw
              difference is the gap between the prose and the glass. Move the two apart to
              widen it — and apart *evenly*, or the pair stops reading centred.

              `overflow-hidden` on the wrapper above is what this needs: stepping a
              full-viewport box sideways pushes its right edge past the viewport, and a
              transformed box still counts toward the document's scrollable width, which
              is a horizontal scrollbar on every screen. What gets clipped is empty
              canvas, the vessel being a fraction of its width. */}
          <div className="absolute inset-0 md:translate-x-[calc(var(--vessel-drift,0)*19vw)]">
            <PersistentBottle />
          </div>
        </div>
      </div>
    </div>
  );
}
