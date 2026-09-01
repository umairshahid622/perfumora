import { GalleryGrid } from "../_components/sections/GalleryGrid";
import { VARIANTS } from "../_lib/variants";

/**
 * The `/collection` route (§4.5) — the full catalogue as its own page, reached from
 * the home Gallery's "View the full collection" CTA through the GSAP curtain. It
 * exists so the home page can tease a handful of fragrances instead of burying all
 * twenty-four in a long mid-page scroll.
 *
 * Chrome is the shared <Navigation> from the root layout, like every other route;
 * `pt-[4.75rem]` matches that header's `h-[4.75rem]` so the grid starts below it.
 * Stays a Server Component and hands the whole variant list to the client
 * <GalleryGrid>, which renders and animates the cards — the same grid the home
 * teaser uses, here with every variant.
 */
export default function CollectionPage() {
  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-16 md:py-20">
        <GalleryGrid
          variants={VARIANTS}
          eyebrow="The Collection"
          title="Every fragrance we make"
        />
      </div>
    </main>
  );
}
