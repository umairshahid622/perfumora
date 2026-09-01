"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../_lib/motion";
import { scrollToSection } from "../../_lib/scroll-to";

interface RouteTransition {
  /** Cover the screen, swap to `href`, then reveal it — the animated counterpart
   *  to `router.push`. Falls through to an instant push under reduced motion.
   *
   *  `scrollTo` is the id of a section on the destination page to land on. It's
   *  jumped to while the panel is still covering, so the reveal opens *on* that
   *  section — how the header's in-page links reach home's sections from a route
   *  where those ids don't exist. */
  navigate: (href: string, options?: { scrollTo?: string }) => void;
}

const RouteTransitionContext = createContext<RouteTransition | null>(null);

/** Read the animated navigator. Throws outside the provider so a missing wrap is
 *  an obvious mistake, matching `useCart` / `useScent`. */
export function useRouteTransition() {
  const ctx = useContext(RouteTransitionContext);
  if (!ctx) {
    throw new Error(
      "useRouteTransition must be used within <RouteTransitionProvider>",
    );
  }
  return ctx;
}

/** The destination's name for the panel to wear as it covers — "Checkout" on the
 *  way in, "Home" on the way back. Derived from the path (last segment, title
 *  cased; "/" reads as Home) so a new route needs no wiring here. */
function routeLabel(href: string): string {
  if (href === "/") return "Home";
  const segment = href.split("/").filter(Boolean).pop() ?? "";
  return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : "Home";
}

/**
 * Route-transition curtain (§4.0). No route change in the site cuts — the drawer's
 * Checkout button, the Gallery's collection CTA, the header's wordmark: a dark
 * panel sweeps up to cover the viewport, the route swaps behind it, then the panel
 * lifts off the top to reveal the new page. One continuous upward wipe, reusing the
 * boot loader's vocabulary (dark slab, `power4.inOut`, a centered display-type
 * line) — but lettered with where you're going: "Checkout" heading in, "Home"
 * heading back.
 *
 * It lives here, above every route in the provider tree, rather than inside
 * <Navigation>: the panel has to outlive the swap it is covering, and it has to
 * sit over the header (z-90 above the nav's z-60) for the cover to be total. The
 * click sites reach it through context — the way they reach the cart.
 *
 * The panel stays mounted, parked off-screen below and `pointer-events-none`, so
 * unlike <AppLoader> it needn't unmount to stop swallowing clicks.
 */
export function RouteTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const curtainRef = useRef<HTMLDivElement>(null);
  // The href a cover is travelling toward, read by the arrival effect below; a
  // ref, not state, so setting it mid-cover doesn't re-render through the tween.
  const pending = useRef<string | null>(null);
  // Guards re-entrancy: a second navigate() while a wipe is in flight still
  // pushes, but doesn't stack a second curtain over the first.
  const busy = useRef(false);
  // The section id to land on once the destination is current, if the caller
  // asked for one. A ref for the same reason as `pending` — it's read by an
  // effect, never rendered.
  const pendingScroll = useRef<string | null>(null);
  // The destination name painted on the panel. State, not a ref: it must reach
  // the DOM before the cover is seen. It's set once per navigate — before the
  // tween starts, while the panel is still off-screen — so the re-render it
  // triggers never lands mid-wipe.
  const [label, setLabel] = useState("Perfumora");

  // Park the panel below the fold before first paint. <AppLoader> (z-100) covers
  // everything during the only moment this runs — first load — so the panel is
  // never seen at rest regardless.
  useGSAP(() => {
    gsap.set(curtainRef.current, { yPercent: 100 });
  });

  const navigate = useCallback(
    (href: string, options?: { scrollTo?: string }) => {
      // Already on the destination: nothing to wipe between, so honour a
      // `scrollTo` as the plain in-page scroll it amounts to. Recording it as
      // pending would strand it — no pathname change is coming to consume it.
      if (href === pathname) {
        if (options?.scrollTo) scrollToSection(options.scrollTo);
        return;
      }
      pendingScroll.current = options?.scrollTo ?? null;
      // Nothing to animate: mid-wipe, or motion is unwelcome. The landing scroll
      // still happens — the effect below keys off the pathname, not the tween.
      if (busy.current || prefersReducedMotion()) {
        router.push(href);
        return;
      }
      busy.current = true;
      pending.current = href;
      setLabel(routeLabel(href)); // panel wears the destination as it covers
      const el = curtainRef.current;
      if (el) el.style.pointerEvents = "auto"; // own the screen while covering
      gsap.to(el, {
        yPercent: 0,
        duration: 0.5,
        ease: "power4.inOut",
        overwrite: true,
        // Swap the route only once fully covered, so the change is unseen.
        onComplete: () => router.push(href),
      });
    },
    [pathname, router],
  );

  // Landing on a section. Declared before the reveal so the page is already at
  // the right offset when the panel starts lifting — the section is what the
  // reveal uncovers, rather than the top of the page followed by a visible
  // scroll. Instant for the same reason. Under reduced motion there's no panel
  // and this jump is the whole of the arrival.
  useGSAP(
    () => {
      const id = pendingScroll.current;
      if (!id) return;
      pendingScroll.current = null;
      scrollToSection(id, { instant: true });
    },
    { dependencies: [pathname] },
  );

  // Arrival: once the route we covered toward is current, lift the panel up and
  // off, then re-park it below for next time. Runs on every pathname change but
  // no-ops unless it was a cover we started — so a direct load, or the browser
  // Back button, never triggers a stray reveal.
  useGSAP(
    () => {
      if (pending.current === null || pathname !== pending.current) return;
      pending.current = null;
      gsap.to(curtainRef.current, {
        yPercent: -100,
        duration: 0.6,
        ease: "power4.inOut",
        onComplete: () => {
          gsap.set(curtainRef.current, { yPercent: 100 });
          if (curtainRef.current) {
            curtainRef.current.style.pointerEvents = "none";
          }
          busy.current = false;
        },
      });
    },
    { dependencies: [pathname] },
  );

  const value = useMemo(() => ({ navigate }), [navigate]);

  return (
    <RouteTransitionContext.Provider value={value}>
      {children}
      <div
        ref={curtainRef}
        aria-hidden="true"
        className="bg-bg-dark pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
      >
        <span className="font-display text-paper text-[clamp(2rem,7vw,5rem)] tracking-[0.1em] uppercase select-none">
          {label}
        </span>
      </div>
    </RouteTransitionContext.Provider>
  );
}
