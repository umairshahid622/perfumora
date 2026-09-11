import { Container } from "../ui/Container";
import { Section } from "../ui/Section";
import { FragranceName } from "./FragranceName";
import { SECTION_IDS } from "../../_lib/sections";

/**
 * Hero / product showcase (§4.1).
 * The oversized watermark fragrance name sits behind the 3D bottle and the accent glow
 * washes up from beneath it.
 *
 * Persistent stage controls (arrows, position counter, price, size selector, add to bag,
 * and 3D vessel) are hosted at the <OpeningStage> level across Hero, Manifesto, and Ritual.
 */
export function Hero() {
  return (
    <Section id={SECTION_IDS.hero} full className="pt-[4.75rem]">
      {/* Accent glow wash rising from beneath the bottle (§3.3). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 46% at 50% 56%, var(--accent-glow), transparent 72%)",
        }}
      />

      <Container className="relative z-10 flex flex-1 flex-col pb-20 md:pb-24">
        {/* Stage */}
        <div className="relative flex flex-1 items-center justify-center py-0 md:py-1">
          {/* Oversized variant name, behind the bottle */}
          <FragranceName />
        </div>
      </Container>
    </Section>
  );
}


