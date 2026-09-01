import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { ImagePlaceholder } from "../ui/ImagePlaceholder";
import { RevealHeading } from "../ui/RevealHeading";
import { Section } from "../ui/Section";
import { SECTION_IDS } from "../../_lib/sections";

/** Placeholder olfactory pyramid — not brand-approved final notes. */
const NOTES = [
  { stage: "Top", notes: "Bergamot · Pink Pepper" },
  { stage: "Heart", notes: "Orris · Jasmine Absolute" },
  { stage: "Base", notes: "Amber · Sandalwood · Musk" },
] as const;

/**
 * Craft (§4.4): the composition, told as an olfactory pyramid beside a craft
 * image. The image is a labelled placeholder until real art is supplied (§0).
 */
export function Craft() {
  return (
    <Section id={SECTION_IDS.craft} tone="dark">
      <Container>
        <div className="grid gap-12 md:grid-cols-2 md:items-center md:gap-20">
          <ImagePlaceholder
            tone="dark"
            label="Craft imagery"
            // Portrait art, but bounded so the whole beat fits one screen: a
            // 4/5 image at the full half-column would run past the viewport, so
            // cap its width (and therefore its height) and centre it in the column.
            className="mx-auto aspect-[4/5] w-full max-w-[24rem]"
          />
          <div>
            <Eyebrow tone="dark">Craft</Eyebrow>
            <RevealHeading className="text-section mt-4 max-w-[14ch] text-balance">
              Composed in three movements
            </RevealHeading>
            <dl className="mt-10 flex flex-col">
              {NOTES.map((note) => (
                <div
                  key={note.stage}
                  className="border-hairline-on-dark flex items-baseline justify-between gap-6 border-b py-5 last:border-0"
                >
                  <dt className="text-micro text-muted-on-dark font-medium uppercase">
                    {note.stage}
                  </dt>
                  <dd className="text-paper text-right text-lg">{note.notes}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Container>
    </Section>
  );
}
