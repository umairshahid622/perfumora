import { Hero } from "./_components/hero/Hero";
import { Contact } from "./_components/sections/Contact";
import { Craft } from "./_components/sections/Craft";
import { Cta } from "./_components/sections/Cta";
import { Footer } from "./_components/sections/Footer";
import { Gallery } from "./_components/sections/Gallery";
import { Manifesto } from "./_components/sections/Manifesto";
import { Ritual } from "./_components/sections/Ritual";

/**
 * The home route (§2.9). Its sections are reached by in-page anchor, never by a
 * Next.js route — the exceptions being `/checkout` and `/collection`, which have
 * their own files. This stays a Server Component; the header and the scent / cart
 * / sound providers now sit in the root layout (one header and one cart across
 * every route), and the sections pass through as children, so only the
 * interactive pieces opt into the client.
 *
 * Deferred (§6.3): idle float + fragrance-changer spin on the 3D bottle, and the
 * scroll-driven reveals / nav colour transition across these sections. The
 * layout and local-state interactions are complete here.
 */
export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <Manifesto />
        <Ritual />
        <Craft />
        <Gallery />
        <Cta />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
