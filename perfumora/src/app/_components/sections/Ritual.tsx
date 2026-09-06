"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { SECTION_IDS } from "../../_lib/sections";
import { RITUAL_STEPS_DELAY } from "../three/useBottleUncap";

gsap.registerPlugin(ScrollTrigger);

/** Placeholder ritual steps — not brand-approved final copy. */
const STEPS = [
  {
    title: "Prime",
    body: "A single press to warm pulse points — wrist, throat, the nape of the neck.",
  },
  {
    title: "Apply",
    body: "Hold the vessel a hand's width away and let the mist settle, never rub.",
  },
  {
    title: "Layer",
    body: "Return through the day as the scent softens; the refill is always close.",
  },
] as const;

/**
 * Where each step sits in the `md` stage grid — the composition itself, kept next
 * to the copy it places. Three columns by two rows: 01 and 03 take the outer
 * columns level with the vessel's middle, 02 takes the lower centre, and the upper
 * centre cell is deliberately left with nothing in it. That empty cell *is* the
 * bottle's slot; the row is `1fr`, so it swallows whatever height the heading and
 * 02 do not use.
 */
const STEP_PLACEMENT = [
  "md:col-start-1 md:row-start-1 md:self-center", // 01 — left of the bottle
  "md:col-start-2 md:row-start-2", // 02 — below it
  "md:col-start-3 md:row-start-1 md:self-center", // 03 — right of it
] as const;

/**
 * How the three arrive once the spray has happened: each rises this far and fades
 * up, one after the next, so they read as consequences of the mist rather than a
 * row of cards appearing at once.
 */
const STEP_RISE = 24;
const STEP_DURATION = 0.8;
const STEP_STAGGER = 0.12;

/**
 * The Ritual (§4.3): the third beat of the opening, and the last one the bottle appears
 * in.
 *
 * Built as a layer rather than a section, exactly as the Manifesto is — `bg-transparent`,
 * light tone, `overlay` — and `<OpeningStage>` cross-fades it in where the Manifesto
 * fades out, on the same 80px slide from the left and the same curve. So nothing arrives
 * and nothing leaves: the Hero is still underneath, its parchment and glow and watermark
 * intact, and the vessel, the arrows, the counter, the price and Add to Bag are all still
 * there and still live. The vessel's one move is back to the middle — the drift that made
 * room for the Manifesto's column, simply undone — so this beat is composed on the centre
 * of the screen again.
 *
 * `tone="light"` is for the parchment underneath, which belongs to the Hero: painting
 * `bg-bg-light` here would hide it, glow and watermark and product bar together. And
 * `overlay` because nothing behind the nav has changed — the Hero is still the section on
 * screen — so this beat stamps no tone of its own and the header goes on reading the
 * Hero's.
 *
 * No `useReveal`, for the Manifesto's reason: a 32px vertical rise underneath a
 * horizontal slide is two entrances arguing, and the one-shot would fire at whatever
 * point this section's *document* position crossed the trigger — two screens from where
 * it visually is. The heading keeps `RevealHeading`, which is scrubbed to the same scroll
 * and works at the word level, so it reads as detail inside the arrival rather than a
 * second version of it.
 *
 * The three steps arrive after the spray, not with the heading. The bottle's closure
 * lifts, the pump fires and the fragrance hangs in the air (`useBottleUncap`, in the
 * canvas); only then do these three rise into place, 01 to the left of the vessel, 02
 * beneath it, 03 to its right — the empty upper-centre cell of the grid being the
 * glass's own slot. The two halves cannot share a timeline, since one animates a DOM
 * list and the other an object in a WebGL scene, so they share the cue instead:
 * `RITUAL_STEPS_DELAY` is exported from that hook and used as the position of the
 * `from` below, on a trigger with the same window and the same toggle actions.
 *
 * `full` so this owns its own padding rather than taking the Section's default rhythm,
 * and because the beat is a screen tall by construction: it is stacked on the Hero, and
 * the grid's `1fr` row is measured against that screen.
 *
 * Nothing here is selectable: the beat's holder in `<OpeningStage>` is
 * `pointer-events-none` for its whole life, so that the Hero's controls behind it stay
 * clickable through it.
 */
export function Ritual() {
  const listRef = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      // The untouched DOM is the finished composition, so reduced motion is "do
      // nothing": no `from` state is applied and all three are simply present when
      // the beat cross-fades in — which is what the closure does there too (it
      // comes off, without the travel).
      if (prefersReducedMotion()) return;

      const items = gsap.utils.toArray<HTMLElement>("li", listRef.current);
      if (!items.length) return;

      // A timeline rather than a bare tween, so `RITUAL_STEPS_DELAY` can be read as
      // what it is — a position on the same clock the canvas choreography runs on,
      // counted from the top of the beat. `from` renders its start values in
      // `useGSAP`'s layout effect, before the first paint, so the steps are hidden
      // from mount, stay hidden through the wait, and hide again on the reverse.
      gsap
        .timeline({
          scrollTrigger: {
            trigger: `#${SECTION_IDS.ritual}`,
            start: "top top",
            end: "bottom top",
            // Matching the uncap's actions exactly: played on entry from either
            // direction, reversed only off the top. Anything else and the steps
            // would be out of step with the spray that causes them.
            toggleActions: "play none play reverse",
          },
        })
        .from(
          items,
          {
            opacity: 0,
            y: STEP_RISE,
            duration: STEP_DURATION,
            ease: "power3.out",
            stagger: STEP_STAGGER,
          },
          RITUAL_STEPS_DELAY,
        );
    },
    { scope: listRef },
  );

  return (
    <Section
      id={SECTION_IDS.ritual}
      tone="light"
      overlay
      full
      className="bg-transparent pt-20 pb-10 md:pb-12"
    >
      <Container className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col">
          {/* Top-left, and held to a measure that keeps both balanced lines clear
              of the bottle's column — the vessel stands in the middle of the
              screen from just below this block. */}
          <div className="flex max-w-xl flex-col gap-2">
            <Eyebrow>The Ritual</Eyebrow>
            <RevealHeading className="text-section text-balance">
              Three moments, one lasting impression
            </RevealHeading>
          </div>

          {/* Phone-only: the band the bottle occupies above the stacked steps.
              On `md` the empty centre cell of the grid below does this job. */}
          <div aria-hidden="true" className="h-[19vh] shrink-0 md:hidden" />

          {/* Real content now, not a parked composition: no `opacity-0` and no
              `aria-hidden`, so a page whose script never runs still reads out the
              three steps and the reveal above is the only thing withholding them.
              The `1fr` row it reserves for the glass is measured either way. */}
          <ol
            ref={listRef}
            className={cn(
              "mt-6 grid grid-cols-1 gap-6",
              "md:grid-cols-[1fr_minmax(0,0.85fr)_1fr] md:grid-rows-[1fr_auto]",
              "md:flex-1 md:gap-x-10 md:gap-y-6",
            )}
          >
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={cn("flex flex-col", STEP_PLACEMENT[i])}
              >
                {/* A hairline over each step ties the three together as one
                    caption system even though they no longer sit in a row. */}
                <span className="border-hairline-on-light w-full border-t" />
                {/* Numeral and title share a line: three of these have to fit
                    beside and beneath the vessel inside one screen. */}
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="font-display text-accent-on-light text-4xl leading-none">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-lg font-medium tracking-tight">
                    {step.title}
                  </h3>
                </div>
                <p className="text-body text-muted-on-light mt-2 max-w-xs">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  );
}
