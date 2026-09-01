import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { SECTION_IDS } from "../../_lib/sections";
import { ContactForm } from "./ContactForm";

/**
 * Contact (§4.7): editorial intro beside the UI-only enquiry form. Contact
 * details use the reserved `example` domain so they can't be mistaken for a
 * real, brand-approved address (§0). The form itself sends nothing (§1).
 */
export function Contact() {
  return (
    <Section id={SECTION_IDS.contact} tone="light">
      <Container>
        <div className="grid gap-12 md:grid-cols-2 md:gap-20">
          <div>
            <Eyebrow>Contact</Eyebrow>
            <RevealHeading className="text-section mt-4 max-w-[12ch] text-balance">
              Speak with the atelier
            </RevealHeading>
            <p className="text-body text-muted-on-light mt-6 max-w-sm">
              Questions on layering, refills, or a bespoke commission — leave a
              note and we&rsquo;ll respond in kind.
            </p>
            <div className="text-body mt-10 flex flex-col gap-1">
              {/* Placeholder contact details (reserved example domain). */}
              <span>hello@perfumora.example</span>
              <span className="text-muted-on-light">By appointment · Pakistan</span>
            </div>
          </div>
          <ContactForm />
        </div>
      </Container>
    </Section>
  );
}
