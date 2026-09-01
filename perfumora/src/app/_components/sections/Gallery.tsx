"use client";

import { SECTION_IDS } from "../../_lib/sections";
import { VARIANTS } from "../../_lib/variants";
import { useRouteTransition } from "../providers/RouteTransition";
import { Container } from "../ui/Container";
import { RippleButton } from "../ui/RippleButton";
import { Section } from "../ui/Section";
import { GalleryGrid } from "./GalleryGrid";

/** How many fragrances the home page teases before handing off to `/collection`. */
const HOME_PREVIEW_COUNT = 4;

/**
 * Gallery (§4.5) — the home page's teaser for the collection: the first few
 * fragrances as product cards, then a CTA through to the full catalogue. Showing
 * all twenty-four here buried a long scroll in the middle of the one-page
 * narrative, so the complete set moved to its own `/collection` route; this beat
 * shows {@link HOME_PREVIEW_COUNT} and links onward.
 *
 * The cards and their scroll-drift live in the shared <GalleryGrid>, rendered
 * here with a slice and on `/collection` with every variant. The CTA routes
 * through the GSAP curtain (<RouteTransition>) rather than a hard cut, matching
 * the drawer's Checkout button.
 */
export function Gallery() {
  const { navigate } = useRouteTransition();

  return (
    <Section id={SECTION_IDS.gallery} tone="light">
      <GalleryGrid
        variants={VARIANTS.slice(0, HOME_PREVIEW_COUNT)}
        eyebrow="The Collection"
        title="Selected fragrances"
      />

      <Container className="relative z-10 mt-14 flex justify-center md:mt-20">
        <RippleButton
          onClick={() => navigate("/collection")}
          aria-label="View the full collection"
        >
          View the full collection
        </RippleButton>
      </Container>
    </Section>
  );
}
