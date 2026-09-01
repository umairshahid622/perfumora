import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { ScrollButton } from "../ui/ScrollButton";
import { Section } from "../ui/Section";
import { SECTION_IDS } from "../../_lib/sections";

/**
 * Closing call-to-action (§4.6): a centred invitation back to the product. The
 * headline writes itself word by word on scroll (<RevealHeading>); the button
 * smooth-scrolls to the Hero (an in-page anchor, never a route). Copy is
 * placeholder.
 */
export function Cta() {
  return (
    <Section id={SECTION_IDS.cta} tone="dark">
      <Container className="flex flex-col items-center gap-8 text-center">
        <Eyebrow tone="dark">Begin</Eyebrow>
        <RevealHeading className="text-display max-w-[18ch] text-balance">
          Find the one that becomes yours
        </RevealHeading>
        <ScrollButton to={SECTION_IDS.hero} aria-label="Explore the collection">
          Explore the collection
        </ScrollButton>
      </Container>
    </Section>
  );
}
