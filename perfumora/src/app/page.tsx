import { Suspense } from "react";
import { Contact } from "./_components/sections/Contact";
import { Cta } from "./_components/sections/Cta";
import { Footer } from "./_components/sections/Footer";
import { Gallery } from "./_components/sections/Gallery";
import { OpeningStage } from "./_components/sections/OpeningStage";
import { AuthErrorBanner } from "./_components/ui/AuthErrorBanner";

/**
 * The home route (§2.9). Its sections are reached by in-page anchor, never by a
 * Next.js route — the exceptions being `/checkout` and `/collection`, which have
 * their own files. This stays a Server Component; the header and the scent / cart
 * / sound providers now sit in the root layout (one header and one cart across
 * every route), and the sections pass through as children, so only the
 * interactive pieces opt into the client.
 *
 * The first three beats are one unit. `OpeningStage` holds the Hero, the Manifesto and
 * the Ritual all on screen at once and dissolves between them, and it owns the 3D bottle
 * for the same reason: the bottle stands still through all three and then leaves with
 * them, which only works if it lives inside the stage that releases them.
 */
export default function Home() {
  return (
    <>
      {/* Catches Supabase auth errors (expired/invalid links) that land on `/`
          with error params in the URL, and shows a dismissible banner. Wrapped in
          Suspense because useSearchParams needs it in a Server Component tree. */}
      <Suspense fallback={null}>
        <AuthErrorBanner />
      </Suspense>
      <main className="scrollbar-hide">
        <OpeningStage />
        <Gallery />
        <Cta />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

