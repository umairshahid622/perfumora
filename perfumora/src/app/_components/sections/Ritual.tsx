"use client";

import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { cn } from "../../_lib/cn";
import { SECTION_IDS } from "../../_lib/sections";
import { useReveal } from "../../_hooks/useReveal";

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
 * The Ritual (§4.3): a three-step sequence for wearing the fragrance — and the
 * last beat the bottle appears in.
 *
 * Built as a stage rather than a column. The persistent bottle travels back to the
 * centre here and swells, so the three steps are arranged *around* it: 01 to its
 * left, 02 beneath it, 03 to its right, with the vessel itself filling the empty
 * middle. That is the story's turn from contemplation to use — the product comes
 * forward and the copy arranges itself about it.
 *
 * Held to one screen (`full`, so this owns its own padding rather than taking the
 * Section's default rhythm). Every piece of furniture here is therefore sized
 * against the viewport: the heading takes the top-left, 02's caption takes the
 * bottom-centre, and the `1fr` row between them is the bottle's slot.
 *
 * The vessel is deliberately allowed to stand *taller* than that row. It is a fixed
 * canvas layer that nothing clips, and the heading is held to `max-w-xl` on the
 * left, so it can rise past the heading's row in the free space to the right of it —
 * which is what lets this beat be the largest the bottle gets (§4.3's lean-in)
 * inside a single screen. Its only hard floor is 02's caption below it, so the pose
 * in `BOTTLE_WAYPOINTS` sits a touch *above* centre rather than in the middle of the
 * row, and 01 and 03 flank it slightly below its midpoint.
 *
 * Below `md` there is no room to flank anything: the steps stack, and since three
 * of them plus a heading is very nearly a screen on their own, the bottle gets the
 * shallow band above them and little more.
 */
export function Ritual() {
  const scope = useReveal<HTMLDivElement>();
  return (
    <Section
      id={SECTION_IDS.ritual}
      tone="light"
      full
      className="pt-20 pb-10 md:pb-12"
    >
      <Container className="flex flex-1 flex-col">
        <div ref={scope} className="flex flex-1 flex-col">
          {/* Top-left, and held to a measure that keeps both balanced lines clear
              of the bottle's column — the vessel rises through the middle of the
              screen from just below this block. */}
          <div className="flex max-w-xl flex-col gap-2">
            <Eyebrow className="reveal">The Ritual</Eyebrow>
            <RevealHeading className="text-section text-balance">
              Three moments, one lasting impression
            </RevealHeading>
          </div>

          {/* Phone-only: the band the bottle occupies above the stacked steps.
              On `md` the empty centre cell of the grid below does this job. */}
          <div aria-hidden="true" className="h-[19vh] shrink-0 md:hidden" />

          <ol
            className={cn(
              "mt-6 grid grid-cols-1 gap-6",
              "md:grid-cols-[1fr_minmax(0,0.85fr)_1fr] md:grid-rows-[1fr_auto]",
              "md:flex-1 md:gap-x-10 md:gap-y-6",
            )}
          >
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={cn("reveal flex flex-col", STEP_PLACEMENT[i])}
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
