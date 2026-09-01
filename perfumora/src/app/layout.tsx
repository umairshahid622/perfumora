import type { Metadata } from "next";
import "./globals.css";
import { khand, switzer } from "./_lib/fonts";
import { AppLoader } from "./_components/ui/AppLoader";
import { Navigation } from "./_components/navigation/Navigation";
import { AppProviders } from "./_components/providers/AppProviders";

export const metadata: Metadata = {
  title: "Perfumora",
  description:
    "Perfumora — a refillable glass fragrance system. Placeholder copy, not brand-approved.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
        <AppProviders>
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
