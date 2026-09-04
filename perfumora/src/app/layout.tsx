import type { Metadata } from "next";
import "./globals.css";
import { getCatalogue } from "./_lib/catalogue";
import { khand, switzer } from "./_lib/fonts";
import { AppLoader } from "./_components/ui/AppLoader";
import { Navigation } from "./_components/navigation/Navigation";
import { AppProviders } from "./_components/providers/AppProviders";

export const metadata: Metadata = {
  title: "Perfumora",
  description:
    "Perfumora — a refillable glass fragrance system. Placeholder copy, not brand-approved.",
};

/**
 * The catalogue is read here, so it is fetched once per render rather than per
 * navigation, and re-read at most every five minutes. Set on the root layout
 * because the lowest `revalidate` across a route's segments governs the whole
 * route, so this one line covers `/`, `/collection` and `/checkout` alike.
 *
 * Five minutes is the trade the owner feels: an edit in the admin panel shows up
 * on the live site within that window, and the shop is a static page in between.
 */
export const revalidate = 300;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Server-side, so the Supabase credentials never reach the browser and the
  // fragrance list is in the first HTML rather than arriving after a spinner.
  const variants = await getCatalogue();

  return (
    // Browser extensions (password managers, QuillBot, ColorZilla, …) inject
    // attributes onto <html> and <body> before React hydrates, which React then
    // reports as a hydration mismatch. `suppressHydrationWarning` silences that
    // for these two elements only — it does not cascade to children, so a real
    // mismatch anywhere in our own components still surfaces. Needed on both
    // because different extensions target each.
    <html
      lang="en"
      className={`${khand.variable} ${switzer.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="bg-bg-light text-ink flex min-h-full flex-col"
        suppressHydrationWarning
      >
        {/* First-load curtain. Rendered here at the root so it covers the page
            from first paint, and unmounts itself once the reveal completes. */}
        <AppLoader />
        {/* The scent / cart / sound providers (§5) live here, above every route,
            so the cart survives a client navigation between `/`, `/checkout` and
            `/collection` (layouts don't remount on navigation). <AppLoader> stays
            outside — it reads none of them. */}
        <AppProviders variants={variants}>
          {/* One header for the whole site (§4.0), mounted here rather than per
              page: inside the providers because it reads the cart and the route
              curtain, and above `children` so every route wears the same instance.
              Its panels' state and its scroll position therefore survive a route
              change — the site behaves as one application, not three pages that
              each rebuild their own chrome. */}
          <Navigation />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
