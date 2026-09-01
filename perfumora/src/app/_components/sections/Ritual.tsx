import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { SECTION_IDS } from "../../_lib/sections";

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
 * The Ritual (§4.3): a three-step sequence for wearing the fragrance. Static
 * layout; the scroll-reveal stagger on the steps is deferred to the scroll
 * module (§6.3 #12).
 */
export function Ritual() {
  return (
    <Section id={SECTION_IDS.ritual} tone="light">
      <Container>
        <div className="flex flex-col gap-4">
          <Eyebrow>The Ritual</Eyebrow>
          <RevealHeading className="text-section max-w-[16ch] text-balance">
            Three moments, one lasting impression
          </RevealHeading>
        </div>
        <ol className="mt-14 grid gap-10 md:mt-20 md:grid-cols-3 md:gap-10">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col">
              <span className="font-display text-accent-on-light text-5xl leading-none">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-xl font-medium tracking-tight">
                {step.title}
              </h3>
              <p className="text-body text-muted-on-light mt-3 max-w-xs">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
