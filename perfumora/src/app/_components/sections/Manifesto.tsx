"use client";

import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { SECTION_IDS } from "../../_lib/sections";

/**
 * Manifesto (§4.2): the brand's philosophy beat. The copy frames the daily ritual
 * of choosing and wearing the scent, and the vessel made for that moment; wording
 * is a working draft pending brand sign-off.
 *
 * This beat has no surface of its own. It is a *layer over the Hero* — `bg-transparent`,
 * light tone — and `<OpeningStage>` fades it in where the Hero's oversized fragrance
 * name fades out. So the Hero does not go anywhere while this is read: the vessel, the
 * arrows, the counter, the price and Add to Bag are all still there and still live, and
 * the only thing that changes on the screen is the words behind the glass. That is why
 * the tone is `light` — the parchment underneath belongs to the Hero, and painting
 * `bg-bg-light` here would hide it, glow and watermark and product bar together.
 *
 * `overlay` follows from the same fact and is what keeps the nav still through the
 * beat. The header re-colours itself and moves its active link per `[data-tone]`
 * section, but nothing behind it has changed here — the Hero's parchment is still the
 * surface under the nav, and the Hero is still the section on screen. So this beat
 * stamps no tone of its own and the header simply goes on reading the Hero's.
 *
 * It does not carry the page's `useReveal` gesture, and that is deliberate rather than
 * an omission. Every other beat scrolls into view and earns a one-shot rise; this one
 * is cross-faded in place by the stage, which slides the whole block in from the left
 * on the customer's own scroll and takes it back out to the left on the way up. A
 * 32px vertical rise underneath a horizontal slide is two entrances arguing, and the
 * one-shot would fire at whatever point the section's *document* position crosses the
 * trigger — a screen away from where it visually is. The heading keeps `RevealHeading`
 * because that is scrubbed to the same scroll and works at the word level, so it reads
 * as detail inside the arrival instead of a second version of it.
 *
 * The measure is a fraction of the viewport rather than a fixed `max-w`, and that is
 * load-bearing: the vessel it must stay clear of is positioned in viewport units, so
 * the gap between the copy and the glass only holds if the copy scales with the same
 * unit the gap is measured in.
 *
 * The indent is two numbers doing two jobs. `5rem` clears the Hero's left arrow, which
 * sits at the container's edge on the same midline as this copy. `13vw` is this copy's
 * share of the beat's composition: the Hero is built on the centre of the screen, and a
 * column of prose in the left third with the glass still dead centre leaves the right
 * third empty, so both halves step right and the pair reads as centred.
 *
 * They do not step by the same distance, though, and the difference between them is the
 * gap. This copy goes 13vw right; `<OpeningStage>` scrubs the vessel 19vw. Both sit 3vw
 * either side of the 16vw that would have moved them in lockstep, so the midpoint of the
 * pair is unchanged and it still reads centred — while the 6vw between the two numbers is
 * air between the prose and the glass, on top of whatever the measure already leaves. That
 * is the number to turn: widen the split to open the gap, keep it symmetric to stay
 * centred.
 *
 * All of it is `md:` only — on a phone neither the arrow nor the vessel can be cleared
 * at 327px of container, so there the copy is laid over the glass and the vessel does
 * not move at all.
 *
 * Nothing here is selectable: the beat's holder in `<OpeningStage>` is
 * `pointer-events-none` for its whole life so that the Hero's controls behind it stay
 * clickable through the beat.
 */
export function Manifesto() {
  return (
    <Section
      tone="light"
      overlay
      className="bg-transparent"
    >
      <Container>
        <div className="flex max-w-md flex-col md:ml-[calc(5rem_+_13vw)] md:max-w-[min(28rem,30vw)]">
          <Eyebrow>Manifesto</Eyebrow>

          {/* Working copy — final wording pending brand sign-off. */}
          <RevealHeading className="text-section mt-6 max-w-[14ch] text-balance md:mt-9">
            First, the ritual.
          </RevealHeading>

          {/* A hairline instead of more space: it gives the statement a base
              to sit on and reads as editorial structure rather than padding.
              Bounded by the measure above, so it stops short of the glass. */}
          <div className="border-hairline-on-light mt-6 border-t md:mt-11" />

          <div className="mt-6 flex flex-col gap-4 md:mt-9 md:gap-5">
            <p className="text-body text-muted-on-light">
              The lift of the cap, the press to the wrist, the pause before the
              day begins. A fragrance is worn — but first, each morning, it is
              chosen.
            </p>
            <p className="text-body text-muted-on-light">
              The vessel is made for that moment: weighted in the hand, sculpted
              to be reached for, a small ceremony repeated at the start of each
              day.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
