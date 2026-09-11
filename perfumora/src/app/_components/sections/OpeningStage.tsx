"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Hero } from "../hero/Hero";
import { PositionCounter } from "../hero/PositionCounter";
import { ProductBar } from "../hero/ProductBar";
import { VariantArrows } from "../hero/VariantArrows";
import { Container } from "../ui/Container";
import { PersistentBottle } from "../three/PersistentBottle";
import { Manifesto } from "./Manifesto";
import { Ritual } from "./Ritual";
import { prefersReducedMotion } from "../../_lib/motion";
import { SECTION_IDS } from "../../_lib/sections";

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
 * Five screens, each one doing a job:
 *
 *   0 → 1  The Manifesto arrives. Every panel is stuck at the top; the watermark goes,
 *          the Manifesto slides in and fades up, and the vessel steps right — all
 *          scrubbed, so the customer's own wheel is the transport.
 *   1 → 2  The changeover. The Manifesto fades out to the left, exactly reversing its
 *          own entrance, while the Ritual fades in from the left in its place and the
 *          vessel comes back to the middle.
 *   2 → 3  The Ritual steps, held. The cap lifts, pump fires, mist sprays, and the
 *          three application steps stagger in around the upright vessel.
 *   3 → 4  The Ritual showcase. The steps fade out, the cap glides shut, the bottle
 *          tilts to the dramatic showcase angle, and the lasting impression subtitle arrives.
 *   4 → 5  The release. All panels un-stick together — they are the same height,
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
  const manifestoPanel = useRef<HTMLDivElement>(null);
  const ritualPanel = useRef<HTMLDivElement>(null);
  const productBarWrap = useRef<HTMLDivElement>(null);
  const counterWrap = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const stageEl = stage.current;
      const manifestoPanelEl = manifestoPanel.current;
      const ritualPanelEl = ritualPanel.current;
      const barEl = productBarWrap.current;
      const counterEl = counterWrap.current;
      if (!stageEl || !manifestoPanelEl || !ritualPanelEl) {
        return;
      }

      // How far a panel travels to arrive: 80px, which is the Manifesto copy's own
      // indent, so a block slides in by exactly the distance it is inset by.
      const slide = prefersReducedMotion() ? 0 : -80;

      // Both dissolves' start state belongs to GSAP rather than to a class.
      gsap.set([manifestoPanelEl, ritualPanelEl], {
        autoAlpha: 0,
        x: slide,
      });

      // The watermark's presence and the vessel's drift, as unitless progress on the
      // stage element. GSAP writes the number below; CSS owns what the number means.
      gsap.set(stageEl, {
        "--name-presence": 1,
        "--vessel-drift": 0,
      });

      const isMobile = window.innerWidth < 768;

      if (barEl) {
        gsap.set(barEl, { autoAlpha: 1 });
      }
      if (counterEl) {
        gsap.set(counterEl, { autoAlpha: 1 });
      }

      // Both changeovers on one timeline and one trigger over the stage's opening beats.
      // Direct scrub (0.8) ensures continuous, smooth bidirectional scrubbing with Lenis.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stageEl,
          start: "top top",
          end: () => `+=${window.innerHeight * 4}`,
          scrub: 0.8,
        },
      });

      const beat = { ease: "power1.inOut", duration: 1.0 };

      tl
        // 0.0 → 1.0: Hero name leaves, Manifesto slides in and fades up to full opacity, vessel steps right.
        .to(manifestoPanelEl, { autoAlpha: 1, x: 0, ...beat }, 0)
        .to(
          stageEl,
          { "--name-presence": 0, ease: "power1.inOut", duration: 0.5 },
          0.1,
        )
        .to(stageEl, { "--vessel-drift": 1, ...beat }, 0)

        // 1.0 → 2.0: MANIFESTO READING WINDOW (held still at 100% opacity for 1 full screen)

        // 2.0 → 3.0: Manifesto smoothly fades out to the left and bottle returns to center.
        .to(
          manifestoPanelEl,
          { autoAlpha: 0, x: slide, ...beat },
          2.0,
        )
        .to(stageEl, { "--vessel-drift": 0, ...beat }, 2.0)

        // 2.0 → 3.0: Ritual arrives cleanly right as you transition into the Ritual section!
        .to(
          ritualPanelEl,
          { autoAlpha: 1, x: 0, ...beat },
          2.0,
        );

      // On mobile viewports (<768px), smoothly fade out the Product Bar & Counter during the Manifesto -> Ritual transition (2.0 -> 3.0) so it doesn't collide with the Ritual 3-step card!
      if (barEl && isMobile) {
        tl.to(barEl, { autoAlpha: 0, ...beat }, 2.0);
      }
      if (counterEl && isMobile) {
        tl.to(counterEl, { autoAlpha: 0, ...beat }, 2.0);
      }

      ScrollTrigger.refresh();
    },
    { scope: stage },
  );

  return (
    <div ref={stage} data-opening-stage className="relative h-[500vh]">
      {/* Anchor targets for in-page navigation */}
      <div id={SECTION_IDS.hero} className="absolute top-0 h-px w-px pointer-events-none" />
      <div id={SECTION_IDS.manifesto} className="absolute top-[100vh] h-px w-px pointer-events-none" />
      <div id={SECTION_IDS.ritual} className="absolute top-[200vh] h-px w-px pointer-events-none" />

      {/* Single persistent sticky viewport across all opening stage beats */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Layer 1: Hero */}
        <div className="absolute inset-0">
          <Hero />
        </div>

        {/* Layer 2: Manifesto Overlay */}
        <div
          ref={manifestoPanel}
          className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        >
          <div className="h-full">
            <Manifesto />
          </div>
        </div>

        {/* Layer 3: Ritual Overlay */}
        <div
          ref={ritualPanel}
          className="pointer-events-none absolute inset-0 z-30 overflow-y-auto md:overflow-hidden"
        >
          <div className="relative z-50 min-h-full h-auto md:h-full pointer-events-none">
            <Ritual />
          </div>
        </div>

        {/* Layer 4: Persistent 3D Bottle */}
        <div className="pointer-events-none absolute inset-0 z-30 md:translate-x-[calc(var(--vessel-drift,0)*21vw)]">
          <PersistentBottle />
        </div>

        {/* Layer 5: Persistent Stage Controls: Variant Arrows & Position Counter */}
        <div className="pointer-events-none absolute inset-0 z-35 md:z-55 pt-[4.75rem] pb-20 md:pb-24">
          <Container className="relative flex h-full flex-1 flex-col">
            <div className="relative flex flex-1 items-center justify-center py-0 md:py-1">
              <div className="relative z-10 flex h-[48vh] sm:h-[54vh] md:h-[65vh] max-h-[580px] w-full max-w-[320px] sm:max-w-[420px] md:max-w-[520px] flex-col items-center justify-center">
                <div aria-hidden="true" className="h-full w-full" />
                <div
                  ref={counterWrap}
                  className="absolute -bottom-2 md:bottom-0 left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
                >
                  <PositionCounter />
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 z-20">
                <VariantArrows />
              </div>
            </div>
          </Container>
        </div>

        {/* Layer 6: Persistent Product Bar */}
        <div
          ref={productBarWrap}
          className="pointer-events-none md:pointer-events-auto absolute inset-x-0 bottom-0 z-40 md:z-60"
        >
          <Container className="pointer-events-auto">
            <ProductBar />
          </Container>
        </div>
      </div>
    </div>
  );
}
