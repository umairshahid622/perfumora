"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Hero } from "../hero/Hero";
import { PersistentBottle } from "../three/PersistentBottle";
import { Manifesto } from "./Manifesto";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * The opening stage: the Hero and the Manifesto, dissolved between rather than
 * scrolled between (§4.1 → §4.2).
 *
 * The page holds still for the first two beats, and so does the Hero. Both panels are
 * `sticky` at the top of a stage three screens tall, stacked one over the other, and
 * the wheel drives a *changeover of the words* rather than a journey: the Hero's
 * oversized fragrance name fades out as the Manifesto's copy slides in from the left
 * over it. The Manifesto brings no surface of its own — it is transparent, so the
 * parchment, the accent glow, the vessel, the arrows, the counter, the price and Add to
 * Bag are all still there underneath and still live. One layer of text takes over from
 * another in the same space; the only thing that moves is the arriving copy, and it
 * moves 80px, so there is no parallax and no drift to reconcile.
 *
 * Three screens, each one doing a job:
 *
 *   0 → 1  The dissolve. Both panels are stuck at the top; the watermark goes and the
 *          Manifesto slides in and fades up, scrubbed, so the customer's own wheel is
 *          the transport — and scrolling back up plays that same tween in reverse, so
 *          the copy leaves to the left the way it came, with no second animation.
 *   1 → 2  The Manifesto, held. It is stuck on its own now and dead still, which is
 *          the same stillness every other beat gets while it is being read.
 *   2 → 3  The release. Both panels un-stick together — they are the same height, so
 *          they leave on the same pixel — and the stage scrolls away as one block
 *          with the Ritual coming up beneath it. Ordinary scrolling from here down.
 *
 * Nothing in this beat takes pointer events, at any point in that sequence, and the
 * rule is stated on the Manifesto's *holder* rather than on the lifted wrapper inside
 * it — the holder is the box that does the covering. It is a screen tall and it paints
 * above the Hero's holder (later positioned sibling, both `sticky`), so it answers the
 * hit test for everything behind it: the product bar it covers from the bottom while
 * the dissolve runs, then the whole Hero once it sticks. Transparency does not exempt
 * it. With `pointer-events-none` there and inherited by both children, you can step the
 * scent, change the size and add to the bag while reading the philosophy; without it,
 * every button in the Hero is dead from the first pixel of scroll. The price is that
 * the Manifesto's own copy is not selectable, which is the right way round for a layer
 * of prose over a live product.
 *
 * The lift is the one piece of machinery. For the dissolve to be visible the
 * Manifesto has to be on screen during the *first* screen of scroll, but its place
 * in the document is the second — so its wrapper is `fixed` over the viewport until
 * the sticky takes over, and handed back to `absolute` at the exact offset where the
 * two describe the same rectangle. The switch is invisible by construction rather
 * than by a matched pair of numbers.
 *
 * The bottle rides inside that same wrapper, which is what makes it leave with the
 * Manifesto and not a line of scroll logic of its own: it is nailed to the viewport
 * for as long as the pair is lifted or stuck, then travels off with the stage.
 */
export function OpeningStage() {
  const stage = useRef<HTMLDivElement>(null);
  const heroHolder = useRef<HTMLDivElement>(null);
  const lift = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const liftEl = lift.current;
      const panelEl = panel.current;
      const heroEl = heroHolder.current;
      const stageEl = stage.current;
      if (!liftEl || !panelEl || !heroEl || !stageEl) return;

      // How far the Manifesto travels to arrive: 80px, which is the copy's own `ml-20`
      // indent, so the block slides in by exactly the distance it is inset by. The
      // fade alone read as an apparition; with this it enters *from* somewhere.
      // Scrolling up runs the same tween backwards, so it leaves the way it came —
      // out to the left — with no second animation and no direction to detect.
      //
      // Opacity is not conditional but the travel is: a fade is legible to someone who
      // has asked for less motion, a slide is the thing they asked to be spared. Zero
      // makes the tween a no-op on the x axis rather than a special case below.
      const slide = prefersReducedMotion() ? 0 : -80;

      // The dissolve's start state belongs to GSAP rather than to a class: with the
      // script gone the Manifesto should still be a readable section in its resting
      // place instead of an invisible one shifted off its measure. `useGSAP` runs
      // before paint, so nothing flashes. Inertness is the wrapper's
      // `pointer-events`, stated in the markup where it can be seen.
      gsap.set(panelEl, { opacity: 0, x: slide });

      // How much of the Hero's oversized fragrance name is left, 1 → 0. It is seeded
      // here rather than in the stylesheet because a tween needs a resolved number to
      // start from: an unset custom property computes to `""`, which GSAP would read
      // as 0 and the word would be erased before the dissolve began. `<FragranceName>`
      // reads it as `calc(0.055 * var(--name-presence, 1))` — the resting weight is
      // its number, the presence is this stage's, and neither restates the other.
      //
      // The word is erased through a variable on *this* element rather than by a tween
      // on the word itself, and that is what stopped it being stranded visible. The
      // span is React's: it renders a `style` attribute (`fontSize` is re-derived from
      // the variant on every step of the scent) and its glyphs remount on each step, so
      // an inline `opacity` written there by GSAP is one author among several — and a
      // scrubbed timeline does not write again until the next scroll tick, so anything
      // that drops that value while the customer is holding still hands the word back
      // at full weight. Nothing writes to this div but this effect, and the variable
      // inherits down to the span whatever React does inside it.
      gsap.set(stageEl, { "--name-presence": 1 });

      const settle = (lifted: boolean) =>
        gsap.set(liftEl, { position: lifted ? "fixed" : "absolute" });

      // Progress, not `isActive`. ScrollTrigger reports a trigger inactive at
      // progress 0 exactly as it does at 1 (`!!clipped && clipped < 1`), and progress
      // 0 is scroll 0 — the one place the lift matters most, since dropping it there
      // parks the pair a screen below the fold. `< 1` is the honest question anyway:
      // lifted for the whole dissolve, including its first pixel, and handed back
      // only once the sticky has reached the top.
      const isLifted = (self: ScrollTrigger) => self.progress < 1;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: stageEl,
          start: "top top",
          // The Hero holder's own height, measured rather than restated as `100vh`:
          // it is exactly the scroll at which the Manifesto's sticky engages, and on
          // a phone `100vh` and the visible viewport are not the same number — two
          // statements of the same offset is how a handover comes to jump.
          end: () => `+=${heroEl.offsetHeight}`,
          scrub: true,
          onToggle: (self) => settle(isLifted(self)),
        },
      });

      // The two layers of text trade places, but not from the first pixel. For the
      // first fifth of the scroll the Hero is untouched, then the name goes, and it is
      // gone by the halfway point — where the copy crosses half opacity and becomes
      // properly readable. So the word leaves exactly as the Manifesto becomes legible:
      // one event, rather than a slow erase followed by an unrelated fade. Scrubbing
      // back up reverses it and the name returns to its own resting weight.
      tl.to(
        panelEl,
        { opacity: 1, x: 0, ease: "power1.inOut", duration: 1 },
        0,
      ).to(
        stageEl,
        { "--name-presence": 0, ease: "power1.inOut", duration: 0.3 },
        0.2,
      );

      // Every other ScrollTrigger on the page reads the Manifesto's position in the
      // document — the nav's tone handover, the `#manifesto` anchor, its own reveal.
      // While it is lifted, `getBoundingClientRect` answers with the viewport, which
      // would key all three to the Hero's screen. So the lift is dropped for the
      // length of a refresh and restored once every trigger has been measured: both
      // events fire inside one frame, so nothing paints in between.
      const st = tl.scrollTrigger!;
      const drop = () => settle(false);
      const restore = () => settle(isLifted(st));
      ScrollTrigger.addEventListener("refreshInit", drop);
      ScrollTrigger.addEventListener("refresh", restore);

      // The nav's triggers are built in the layout, before this stage exists, so
      // they were measured against a Manifesto that was already lifted. One refresh
      // with the pair above in place is what puts them on the honest position — and
      // it is also what gives `lift` its first `position` for the current scroll.
      ScrollTrigger.refresh();

      return () => {
        ScrollTrigger.removeEventListener("refreshInit", drop);
        ScrollTrigger.removeEventListener("refresh", restore);
      };
    },
    { scope: stage },
  );

  return (
    <div ref={stage} className="relative h-[300vh]">
      {/* Stuck for the first two screens of the stage, so the Hero is still on
          screen underneath while it is being covered. */}
      <div ref={heroHolder} className="sticky top-0 h-screen">
        <Hero />
      </div>

      {/* The Manifesto's own screen of the document — the second one, which is what
          keeps the nav's tone handover and the `#manifesto` anchor honest. Same
          height as the Hero's holder, so the two release on the same pixel.

          `pointer-events-none` is stated here, on the outermost box of the beat,
          because that is the box that does the covering. It is a full screen tall
          and it paints above the Hero's holder — later positioned sibling, both
          `sticky` — so from the moment it starts rising into the viewport it answers
          the hit test for everything behind it: first the product bar it covers from
          the bottom during the dissolve, then the whole Hero once it sticks. Being
          transparent does not exempt it. Nothing inside this beat is ever meant to be
          clicked (the Manifesto is prose over a live product, the bottle is
          decoration), so the rule is stated once and inherited by the lift and the
          vessel rather than repeated on each. */}
      <div className="pointer-events-none sticky top-0 h-screen">
        {/* Lifted over the viewport while the dissolve runs; `z-30` carries the
            whole pair above the Hero's own furniture (z-10, z-20) and leaves them
            under the nav. */}
        <div ref={lift} className="absolute inset-0 z-30">
          <div ref={panel} className="h-full">
            <Manifesto />
          </div>
          <PersistentBottle />
        </div>
      </div>
    </div>
  );
}
