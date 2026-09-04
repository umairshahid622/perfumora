import { GalleryGrid } from "../_components/sections/GalleryGrid";
import { getCatalogue } from "../_lib/catalogue";

/**
 * The `/collection` route (§4.5) — the full catalogue as its own page, reached from
 * the home Gallery's "View the full collection" CTA through the GSAP curtain. It
 * exists so the home page can tease a handful of fragrances instead of burying the
 * whole catalogue in a long mid-page scroll.
 *
 * Chrome is the shared <Navigation> from the root layout, like every other route;
 * `pt-[4.75rem]` matches that header's `h-[4.75rem]` so the grid starts below it.
 * Stays a Server Component and hands the whole variant list to the client
 * <GalleryGrid>, which renders and animates the cards — the same grid the home
 * teaser uses, here with every variant.
 *
 * It reads the catalogue itself rather than taking it from `<ScentProvider>`: that
 * would make this a Client Component for data the server already has. `getCatalogue`
 * is `cache()`-wrapped, so sharing a request with the root layout's own call costs
 * one query, not two.
 */
export default async function CollectionPage() {
  const variants = await getCatalogue();

  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-16 md:py-20">
        <GalleryGrid
          variants={variants}
          eyebrow="The Collection"
          title="Every fragrance we make"
        />
      </div>
    </main>
  );
}
