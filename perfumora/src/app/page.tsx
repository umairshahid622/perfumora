import { Hero } from "./_components/hero/Hero";
import { Contact } from "./_components/sections/Contact";
import { Craft } from "./_components/sections/Craft";
import { Cta } from "./_components/sections/Cta";
import { Footer } from "./_components/sections/Footer";
import { Gallery } from "./_components/sections/Gallery";
import { Manifesto } from "./_components/sections/Manifesto";
import { Ritual } from "./_components/sections/Ritual";
import { PersistentBottle } from "./_components/three/PersistentBottle";

/**
 * The home route (§2.9). Its sections are reached by in-page anchor, never by a
 * Next.js route — the exceptions being `/checkout` and `/collection`, which have
 * their own files. This stays a Server Component; the header and the scent / cart
 * / sound providers now sit in the root layout (one header and one cart across
 * every route), and the sections pass through as children, so only the
 * interactive pieces opt into the client.
 *
 * The 3D bottle is mounted here rather than inside the Hero, as one fixed layer
 * over the whole route: the Hero, Manifesto and Ritual each reserve empty space
 * for it and it *travels* between them on scroll, so a single WebGL context and a
 * single glTF serve all three beats instead of one per section. It lives at this
 * level — not in the root layout — because the journey is specific to this page's
 * sections; `/checkout` and `/collection` have no bottle.
 */
export default function Home() {
  return (
    <>
      <PersistentBottle />
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
