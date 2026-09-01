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
 */
export function Manifesto() {
  const scope = useReveal<HTMLDivElement>();
  return (
    <Section id={SECTION_IDS.manifesto} tone="dark">
      <div ref={scope}>
        <Container>
          <Eyebrow tone="dark" className="reveal">
            Manifesto
          </Eyebrow>
          <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-[1.5fr_1fr] md:gap-20">
            {/* Working copy — final wording pending brand sign-off. */}
            <RevealHeading className="text-section max-w-[15ch] text-balance">
              First, the ritual.
            </RevealHeading>
            <div className="flex flex-col justify-end gap-6">
              <p className="reveal text-body text-muted-on-dark max-w-md">
                The lift of the cap, the press to the wrist, the pause before the
                day begins. A fragrance is worn — but first, each morning, it is
                chosen.
              </p>
              <p className="reveal text-body text-muted-on-dark max-w-md">
                The vessel is made for that moment: weighted in the hand,
                sculpted to be reached for, a small ceremony repeated at the
                start of each day.
              </p>
            </div>
          </div>
        </Container>
      </div>
    </Section>
  );
}
