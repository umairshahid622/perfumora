"use client";

import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { Section } from "../ui/Section";

const PARAGRAPHS = [
  "The lift of the cap, the press to the wrist, the pause before the day begins. A fragrance is worn — but first, each morning, it is chosen.",
  "The vessel is made for that moment: weighted in the hand, sculpted to be reached for, a small ceremony repeated at the start of each day.",
] as const;

/**
 * Manifesto (§4.2): the brand's philosophy beat.
 *
 * Rendered as an overlay over the Hero inside <OpeningStage>.
 * The entire entrance, reading hold, and exit transitions are master-choreographed
 * by OpeningStage to avoid conflicting scroll triggers and maintain frame-perfect
 * synchronization with the 3D bottle drift and tilt.
 */
export function Manifesto() {
  return (
    <Section
      tone="light"
      overlay
      full
      className="bg-transparent pt-16 md:pt-20 pb-8 md:pb-12"
    >
      <Container className="flex flex-1 flex-col justify-center">
        <div className="flex max-w-md flex-col md:ml-[calc(3rem+4vw)] md:max-w-[min(28rem,38vw)]">
          <Eyebrow>Manifesto</Eyebrow>

          <h2 className="font-display text-section mt-4 max-w-[14ch] text-balance font-semibold uppercase md:mt-6">
            First, the ritual.
          </h2>

          <div className="border-hairline-on-light mt-4 border-t md:mt-8" />

          <div className="mt-4 flex flex-col gap-4 text-body text-muted-on-light md:mt-6 md:gap-5">
            {PARAGRAPHS.map((text, i) => (
              <p key={i} className="leading-relaxed">
                {text}
              </p>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}

