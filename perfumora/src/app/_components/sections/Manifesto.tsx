"use client";

import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { SECTION_IDS } from "../../_lib/sections";
import { useReveal } from "../../_hooks/useReveal";

/**
 * Manifesto (§4.2): the brand's philosophy beat — a large statement set against
 * the dark tone, with supporting text. The copy frames the daily ritual of
 * choosing and wearing the scent, and the vessel made for that moment; wording
 * is a working draft pending brand sign-off.
 *
 * Laid out around the travelling bottle. The persistent `<PersistentBottle>` layer
 * drifts into the right-hand column as this section takes the screen *and recedes*
 * as it goes, so the copy is deliberately held to the left of it and given a hard
 * measure — the bottle is present in peripheral vision while the philosophy is
 * read, never over it, and no longer the subject. The reserved column is sized to
 * the pose that lands in it (~36vh) rather than to the screen, which is what keeps
 * the whole beat inside one viewport height.
 *
 * Below `md` there is no room to sit beside anything: the bottle lifts into a
 * shallow band at the top of the screen instead, so the column order flips and the
 * copy takes everything under it. The vertical rhythm tightens there too — the two
 * paragraphs run to four lines each on a phone, and they plus that band are the
 * whole screen.
 */
export function Manifesto() {
  const scope = useReveal<HTMLDivElement>();
  return (
    <Section id={SECTION_IDS.manifesto} tone="dark">
      <div ref={scope}>
        <Container>
          <div className="grid items-center gap-6 md:grid-cols-[1.15fr_1fr] md:gap-20">
            {/* Copy column — second in the source order on a phone, so the
                reserved bottle space above it takes the top of the screen. */}
            <div className="order-2 flex flex-col md:order-1">
              <Eyebrow tone="dark" className="reveal">
                Manifesto
              </Eyebrow>

              {/* Working copy — final wording pending brand sign-off. */}
              <RevealHeading className="text-section mt-6 max-w-[14ch] text-balance md:mt-9">
                First, the ritual.
              </RevealHeading>

              {/* A hairline instead of more space: it gives the statement a base
                  to sit on and reads as editorial structure rather than padding. */}
              <div className="reveal border-hairline-on-dark mt-6 border-t md:mt-11" />

              <div className="mt-6 flex max-w-md flex-col gap-4 md:mt-9 md:gap-5">
                <p className="reveal text-body text-muted-on-dark">
                  The lift of the cap, the press to the wrist, the pause before
                  the day begins. A fragrance is worn — but first, each morning,
                  it is chosen.
                </p>
                <p className="reveal text-body text-muted-on-dark">
                  The vessel is made for that moment: weighted in the hand,
                  sculpted to be reached for, a small ceremony repeated at the
                  start of each day.
                </p>
              </div>
            </div>

            {/* Reserved space the persistent bottle drifts into while this section
                is in view — the model is the fixed layer, never mounted here. */}
            <div
              aria-hidden="true"
              className="order-1 h-[24vh] w-full md:order-2 md:h-[40vh]"
            />
          </div>
        </Container>
      </div>
    </Section>
  );
}
