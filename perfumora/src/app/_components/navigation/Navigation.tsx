"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCart } from "../../_lib/cart-context";
import { prefersReducedMotion } from "../../_lib/motion";
import { scrollToSection } from "../../_lib/scroll-to";
import { SECTION_IDS } from "../../_lib/sections";
import { useRouteTransition } from "../providers/RouteTransition";
import { AuthModal } from "./AuthModal";
import { CartDrawer } from "./CartDrawer";
import { ChevronIcon, BagIcon, PersonIcon } from "./icons";
import { MegaMenu } from "./MegaMenu";
import { SoundToggle } from "./SoundToggle";

gsap.registerPlugin(ScrollTrigger);

type Panel = "menu" | "cart" | "auth" | null;

/**
 * The centre links' shared shape. A plain string, deliberately not run through
 * `cn()`: tailwind-merge groups `text-micro` (a font size, since `micro` isn't a
 * t-shirt size it can recognise) with `text-accent-on-light` (a colour) as one
 * `text-*` conflict and keeps only the last one written — so merging the two
 * dropped the size and the label jumped to the inherited body scale the moment it
 * became current. Concatenation keeps both.
 */
const CENTRE_LINK = "text-micro font-medium uppercase transition-colors";

/**
 * Current links wear the accent outright; the rest reveal it on hover. Which form of
 * the accent depends on the tone behind the header: the on-light one is floored for
 * the parchment, and over a dark section that floor makes it the dimmest thing in a
 * row of paper-white labels — a current link that reads as switched off. Both forms
 * are written out in full because Tailwind only generates classes it can see as
 * literals; a `hover:${...}` built at runtime would never reach the stylesheet.
 */
const linkTone = (current: boolean, tone: "light" | "dark") => {
  if (tone === "dark")
    return current ? "text-accent-on-dark" : "hover:text-accent-on-dark";
  return current ? "text-accent-on-light" : "hover:text-accent-on-light";
};

/**
 * Persistent header (§4.0): three zones — wordmark, four centre links (the Home and
 * Contact anchors, the Fragrances dropdown, the Collection route), three right
 * icons (account, cart, sound). It owns the open/closed booleans for its panels as
 * local state (§5) and hosts the mega-menu, cart drawer and auth modal, which are
 * overlays, never routes.
 *
 * Mounted once in the root layout, so it is persistent in the literal sense: the
 * same header instance spans `/`, `/checkout` and `/collection` and never
 * remounts on a route change. Three consequences are handled below — the tone
 * ScrollTriggers are rebuilt per route instead of leaking home's, an open panel is
 * dismissed on a browser Back/Forward, and the in-page links route home first when
 * the ids they point at aren't on the current page.
 *
 * Still deferred to the nav-animation module (§6.3): the scroll-driven
 * transparent→solid background.
 */
export function Navigation() {
  const { count } = useCart();
  const { navigate } = useRouteTransition();
  const pathname = usePathname();
  const [panel, setPanel] = useState<Panel>(null);
  // Whether the Fragrances panel is on screen at all: true from the click that opens
  // it, cleared by the panel itself once its close animation has finished. `panel`
  // can't answer that — it flips at the closing click, while the panel is still there
  // sliding shut, so handing the accent back on it would beat the panel off screen.
  const [menuVisible, setMenuVisible] = useState(false);
  // The section currently under the nav's midline, set by the same ScrollTriggers
  // that repaint the nav (below). Drives the active state of the centre links that
  // point at home's sections.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // The tone of that same section. The nav's own colour tweens between ink and paper
  // to suit it; the accent doesn't tween — it has a form per tone, and this says
  // which one the links should be wearing.
  const [toneBehind, setToneBehind] = useState<"light" | "dark">("light");
  const chevronRef = useRef<SVGSVGElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const close = () => setPanel(null);
  const toggle = (next: Exclude<Panel, null>) =>
    setPanel((current) => (current === next ? null : next));

  // The Fragrances button. The panel counts as on screen from this click either way:
  // on the way in that is the point, and on the way out it is already true and stays
  // so until the panel reports itself gone. Reported rather than timed here, so the
  // 0.55s reverse never has to be restated in this file.
  const toggleMenu = () => {
    setMenuVisible(true);
    toggle("menu");
  };

  /** Handed to <MegaMenu> to call once its close animation has fully played out.
   *  Stable, because the panel keeps it in an effect's dependencies. */
  const menuClosed = useCallback(() => setMenuVisible(false), []);

  // Escape closes whatever panel is open.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  // Lock body scroll while any overlay is open.
  useEffect(() => {
    document.body.style.overflow = panel ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [panel]);

  // The header outlives every route now, so an open overlay — and the body scroll
  // lock it sets — would otherwise ride along to the next page and sit there over
  // it. Every in-app route change already closes on the way out (`goTo`, the
  // drawer's Checkout button), which leaves the browser's own Back/Forward as the
  // one way through: caught at its source rather than by watching the pathname,
  // since a route change is not something this header needs to re-render for.
  useEffect(() => {
    if (!panel) return;
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [panel]);

  // Chevron indicator flips via GSAP (motion authored in code, not CSS).
  useGSAP(
    () => {
      if (!chevronRef.current) return;
      gsap.to(chevronRef.current, {
        rotation: panel === "menu" ? 180 : 0,
        duration: 0.3,
        ease: "power2.out",
        transformOrigin: "50% 50%",
      });
    },
    { dependencies: [panel] },
  );

  // Nav tone (§4.0): the header is fixed over sections that alternate parchment
  // and near-black, so its colour has to follow whichever one is behind it. Each
  // `[data-tone]` block gets a ScrollTrigger spanning the stretch where it sits
  // under the nav's own midline, and the nav's `color` tweens between `--ink` and
  // `--paper`. The wordmark and centre links carry no colour of their own, so
  // that single tween moves all of them by inheritance.
  //
  // Rebuilt per route (`revertOnUpdate`) because the sections it watches belong to
  // the page, not to this header: without the revert, leaving `/` would leak
  // triggers pointing at detached nodes, duplicate them on the way back, and
  // strand the last inline `color` — a `--paper` nav left over from a dark section
  // would land invisible on the parchment of `/checkout`. The revert clears that
  // inline colour too, so the `text-ink` class resumes on routes that have no
  // `[data-tone]` of their own.
  useGSAP(() => {
    const nav = navRef.current;
    if (!nav) return;

    // Measured rather than restating `h-[4.75rem]` here, so the handover point
    // cannot drift from the height class.
    const midline = nav.getBoundingClientRect().height / 2;
    const duration = prefersReducedMotion() ? 0 : 0.4;

    // `--ink`/`--paper` are declared as literal hexes, so they need no resolving.
    const paint = (tone: string | undefined, seconds: number) =>
      gsap.to(nav, {
        color: getComputedStyle(nav)
          .getPropertyValue(tone === "dark" ? "--paper" : "--ink")
          .trim(),
        duration: seconds,
        ease: "power2.out",
        overwrite: true,
      });

    // Queried off `document`, not scoped to `navRef`: the sections being watched
    // are the nav's siblings, not its children.
    document.querySelectorAll<HTMLElement>("[data-tone]").forEach((section) => {
      const tone = section.dataset.tone;
      // Three jobs off one trigger: repaint the nav, record which section the
      // header is over so the link pointing at it can read as current, and record
      // that section's tone so the accent uses the form that reads on it. Sharing
      // the trigger means the highlight, the accent form and the colour all hand
      // over at the same scroll position by construction, rather than by three sets
      // of matching numbers.
      const arrive = (seconds: number) => {
        paint(tone, seconds);
        setActiveSection(section.id);
        setToneBehind(tone === "dark" ? "dark" : "light");
      };
      ScrollTrigger.create({
        trigger: section,
        start: `top top+=${midline}`,
        end: `bottom top+=${midline}`,
        onEnter: () => arrive(duration),
        onEnterBack: () => arrive(duration),
        // Covers the two cases where no crossing happens: the first evaluation
        // after mount — a reload part-way down the page starts *inside* a section
        // rather than entering it — and a resize that moves the boundaries.
        onRefresh: (self) => {
          if (self.isActive) arrive(0);
        },
      });
    });
  }, { dependencies: [pathname], revertOnUpdate: true });

  // Which centre link reads as current. The two anchors point at home's sections,
  // so scroll position decides — `activeSection` is whichever section sits under the
  // nav's midline — and only ever on home, since off it the last section the header
  // passed is no longer on screen. Collection is a route, so it asks the pathname;
  // Fragrances is a panel, so it asks its own open state.
  const atHome = pathname === "/";
  const atHero = atHome && activeSection === SECTION_IDS.hero;
  const atContact = atHome && activeSection === SECTION_IDS.contact;
  const atCollection = pathname === "/collection";

  // What Home's *colour* means. Keyed to the hero section it blinked out for the whole
  // stretch in between — nothing in the header was lit from Manifesto to Craft, since
  // those sections have no link of their own — which is the disappearance being fixed.
  // Home reads as the page instead: lit anywhere on `/`, standing down only where
  // Contact takes over. Its `aria-current` below stays keyed to the section, which is
  // the place that attribute actually names.
  const homeCurrent = atHome && !atContact;

  // Which form of the accent the links wear. The header only passes `[data-tone]`
  // sections on home; on the other routes `revertOnUpdate` has already handed it back
  // to `text-ink` over parchment, so the on-light form is the right one there whatever
  // the triggers last saw before the route changed.
  const accentTone = atHome ? toneBehind : "light";

  // A Fragrances panel on screen is the one current thing in the header, so the other
  // three stand down — the `&& !menuVisible` at each className below is what keeps two
  // links from wearing the accent at once, and it holds until the panel has finished
  // closing rather than releasing at the click. Colour only: the `aria-current` flags
  // stay as they are, since opening a dropdown doesn't change which page you are on
  // or which section you are over.

  // Where the header's in-page links go. On home they are what they look like: a
  // smooth scroll to a section. On `/checkout` and `/collection` those ids don't
  // exist — `scrollToSection` would silently no-op and the link would read as
  // broken — so the same click routes home through the curtain and lands on the
  // section as the panel lifts.
  const goTo = (id: string) => {
    close();
    if (atHome) {
      scrollToSection(id);
      return;
    }
    navigate("/", { scrollTo: id });
  };

  // The drawer's Checkout CTA: an empty cart has nothing to check out, so the click
  // is refused rather than landing on a `/checkout` with no lines. Deliberately not
  // memoised — `count` changes with every add, and a `useCallback` that doesn't list
  // it reads whatever the cart held when this header first mounted, which is nothing.
  const onCheckOut = () => {
    if (count === 0) return;
    close();
    navigate("/checkout");
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] h-[4.75rem]">
        <nav
          ref={navRef}
          className="text-ink mx-auto flex h-full max-w-[110rem] items-center justify-between px-6 md:px-16"
        >
          {/* Left — wordmark */}
          <button
            type="button"
            onClick={() => goTo(SECTION_IDS.hero)}
            className="font-display hover:text-accent-on-light text-2xl tracking-[0.02em] uppercase transition-colors"
          >
            Perfumora
          </button>

          {/* Middle — the two home anchors, the Fragrances dropdown, the Collection
              route. `aria-current="page"` for the one that is a route; `"true"` for
              the anchors, which mark a place within the current page rather than a
              different one. */}
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
            <button
              type="button"
              onClick={() => goTo(SECTION_IDS.hero)}
              aria-current={atHero ? "true" : undefined}
              className={`${CENTRE_LINK} ${linkTone(homeCurrent && !menuVisible, accentTone)}`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={toggleMenu}
              aria-expanded={panel === "menu"}
              className={`${CENTRE_LINK} flex items-center gap-1.5 ${linkTone(menuVisible, accentTone)}`}
            >
              Fragrances
              <ChevronIcon ref={chevronRef} className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => navigate("/collection")}
              aria-current={atCollection ? "page" : undefined}
              className={`${CENTRE_LINK} ${linkTone(atCollection && !menuVisible, accentTone)}`}
            >
              Collection
            </button>
            <button
              type="button"
              onClick={() => goTo(SECTION_IDS.contact)}
              aria-current={atContact ? "true" : undefined}
              className={`${CENTRE_LINK} ${linkTone(atContact && !menuVisible, accentTone)}`}
            >
              Contact
            </button>
          </div>

          {/* Right — three icons only */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggle("auth")}
              aria-label="Account"
              className="hover:text-accent-on-light grid size-10 place-items-center transition-colors"
            >
              <PersonIcon className="size-5" />
            </button>

            <button
              type="button"
              onClick={() => toggle("cart")}
              aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
              className="hover:text-accent-on-light relative grid size-10 place-items-center transition-colors"
            >
              <BagIcon className="size-5" />
              {count > 0 && (
                <span className="bg-accent text-accent-contrast absolute top-1 right-0.5 grid size-4 place-items-center rounded-full text-[0.6rem] font-semibold">
                  {count}
                </span>
              )}
            </button>

            <SoundToggle />
          </div>
        </nav>
      </header>

      {/* Picking a fragrance commits the variant, then hands back here for the
          trip to the Hero — a scroll on home, a route change off it. */}
      <MegaMenu
        open={panel === "menu"}
        onClose={close}
        onClosed={menuClosed}
        onSelect={() => goTo(SECTION_IDS.hero)}
      />
      <CartDrawer
        open={panel === "cart"}
        onClose={close}
        onCheckout={onCheckOut}
      />

      <AuthModal open={panel === "auth"} onClose={close} />
    </>
  );
}
