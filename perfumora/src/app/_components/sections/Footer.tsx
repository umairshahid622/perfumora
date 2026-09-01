"use client";

import { cn } from "../../_lib/cn";
import { scrollToSection } from "../../_lib/scroll-to";
import { SECTION_IDS, type SectionId } from "../../_lib/sections";

/** In-page anchors only (§2.9) — every link scrolls to a section id, no routes. */
const LINKS: ReadonlyArray<{ label: string; to: SectionId }> = [
  { label: "The Collection", to: SECTION_IDS.hero },
  { label: "Manifesto", to: SECTION_IDS.manifesto },
  { label: "The Ritual", to: SECTION_IDS.ritual },
  { label: "Craft", to: SECTION_IDS.craft },
  { label: "Gallery", to: SECTION_IDS.gallery },
  { label: "Contact", to: SECTION_IDS.contact },
];

/**
 * Footer (§4.8): wordmark, in-page navigation, and fine print. Links smooth
 * scroll via GSAP ScrollToPlugin — none is a route. Copy is placeholder and the
 * concept status is stated plainly rather than dressed up as a live storefront.
 */
export function Footer() {
  return (
    <footer
      id={SECTION_IDS.footer}
      // Not a <Section> (it sits outside <main>), so it stamps its own tone for
      // the nav's colour swap to read.
      data-tone="dark"
      className="bg-bg-dark text-paper relative flex min-h-screen w-full flex-col justify-center overflow-hidden"
    >
      <div className="mx-auto w-full max-w-[110rem] px-6 py-20 md:px-16 md:py-28">
        <div className="grid gap-14 md:grid-cols-[1.5fr_1fr] md:gap-20">
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={() => scrollToSection(SECTION_IDS.hero)}
              className="font-display hover:text-accent-on-light self-start text-4xl uppercase transition-colors md:text-5xl"
            >
              Perfumora
            </button>
            {/* Placeholder tagline — not brand-approved final copy. */}
            <p className="text-body text-muted-on-dark max-w-xs">
              One sculpted vessel. Four expressions. Endlessly refillable.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-3">
            {LINKS.map((link) => (
              <button
                key={link.to}
                type="button"
                onClick={() => scrollToSection(link.to)}
                className={cn(
                  "text-muted-on-dark hover:text-paper self-start text-base transition-colors",
                )}
              >
                {link.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-hairline-on-dark mt-16 flex flex-col gap-3 border-t pt-8 md:mt-24 md:flex-row md:items-center md:justify-between">
          <span className="text-micro text-muted-on-dark font-medium uppercase">
            © 2026 Perfumora — front-end concept
          </span>
          <span className="text-micro text-muted-on-dark font-medium uppercase">
            Sound can be muted from the header
          </span>
        </div>
      </div>
    </footer>
  );
}
