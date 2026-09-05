"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { useRouteTransition } from "../providers/RouteTransition";

interface AccountMenuProps {
  open: boolean;
  onClose: () => void;
  /** Ask for the log-out confirmation, which is all this row does. The session is
   *  ended by <LogoutConfirm>, so nothing in this panel calls `signOut()` and nothing
   *  in it has a pending state to show — <Navigation> swaps this dropdown for that
   *  card, and the card is where the wait happens. */
  onLogOut: () => void;
}

/**
 * One row, minus its colour. Deliberately not run through `cn()` and not merged
 * with the callers' classes: tailwind-merge reads `text-micro` (a size) and
 * `text-accent-on-light` (a colour) as one `text-*` conflict and keeps only the
 * last, which drops the size — the same trap `CENTRE_LINK` in <Navigation>
 * documents, and the reason the colour is appended as a template literal below
 * rather than living in here. `min-h-11` is the 44px touch floor, since micro caps
 * are far shorter than that on their own.
 */
const ITEM =
  "text-micro flex min-h-11 w-full items-center px-5 text-left font-medium uppercase transition-colors";

/**
 * The row for the page you are on wears the accent outright; the rest reveal it on
 * hover — `linkTone` in <Navigation>, for the header's centre links. No tone
 * argument here: that panel spans the parchment and the near-black sections, while
 * this one is `bg-bg-light` whatever is behind it, so the on-light form is the only
 * one it can need. Both classes are written out in full for the same reason as
 * there: Tailwind only generates what it can see as a literal.
 */
const itemTone = (current: boolean) =>
  current ? "text-accent-on-light" : "hover:text-accent-on-light";

/**
 * The account dropdown: what the avatar opens once someone is signed in, in place
 * of the login card. A small anchored panel rather than an overlay, so it hangs off
 * the button inside the header instead of being `fixed` like <MegaMenu>.
 *
 * Open/close is one paused GSAP timeline built on mount and played or reversed —
 * the same shape <MegaMenu> and <AuthModal> use — with the panel rising and scaling
 * from its top-right corner so it reads as coming out of the avatar, and the rows
 * staggering in behind it.
 *
 * No `role="menu"`: that role promises arrow-key navigation between items, and
 * these are three plain buttons that Tab already reaches in order. Announcing a
 * menu we haven't implemented would be worse for a screen reader than not
 * announcing one.
 */
export function AccountMenu({ open, onClose, onLogOut }: AccountMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const { navigate } = useRouteTransition();
  const pathname = usePathname();

  // Which row is the page you are already on. Read here rather than passed down
  // from <Navigation>, which knows its own three route flags but not this panel's.
  const atOrders = pathname === "/orders";
  const atSettings = pathname === "/settings";

  useGSAP(
    () => {
      // `top right` so the scale reads as the panel emerging from the avatar above
      // it rather than growing out of its own middle.
      gsap.set(panelRef.current, {
        autoAlpha: 0,
        y: -8,
        scale: 0.96,
        transformOrigin: "top right",
      });

      const items = listRef.current?.children;
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
      tl.to(
        panelRef.current,
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.32 },
        0,
      ).from(
        items ? Array.from(items) : [],
        { y: -10, autoAlpha: 0, stagger: 0.05, duration: 0.28 },
        0.08,
      );
      timeline.current = tl;
    },
    { scope: rootRef },
  );

  useEffect(() => {
    const tl = timeline.current;
    if (!tl) return;
    if (prefersReducedMotion()) {
      tl.progress(open ? 1 : 0).pause();
      return;
    }
    if (open) tl.play();
    else tl.reverse();
  }, [open]);

  // Panel first, then the curtain — the order <Navigation>'s own Checkout CTA
  // uses. Dismissing after `navigate` would reverse the open timeline underneath
  // the transition, so the rows would still be lifting away as the new page
  // arrives. Clicking the row you are already on just dismisses: `navigate`
  // returns early on the current pathname rather than wiping to the same page.
  const go = (href: string) => {
    onClose();
    navigate(href);
  };

  return (
    <div ref={rootRef} aria-hidden={!open}>
      {/* Click-anywhere-else to dismiss. Transparent rather than dimming: this is a
          three-row menu hanging off a button, not an overlay over the page. It does
          cover the avatar that opened it — the panel is the only thing above it — so
          a second click on the avatar dismisses through here rather than through the
          header's toggle, which lands on the same closed state either way. */}
      <button
        ref={scrimRef}
        type="button"
        aria-label="Close account menu"
        tabIndex={-1}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      />

      <div
        ref={panelRef}
        aria-label="Account"
        className={cn(
          "border-hairline-on-light bg-bg-light text-ink absolute top-full right-0 z-50 mt-3 w-52 overflow-hidden rounded-2xl border py-2",
          "shadow-[0_18px_44px_-26px_rgba(27,23,18,0.5)]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <ul ref={listRef}>
          <li>
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => go("/orders")}
              aria-current={atOrders ? "page" : undefined}
              className={`${ITEM} ${itemTone(atOrders)}`}
            >
              Your orders
            </button>
          </li>
          <li>
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => go("/settings")}
              aria-current={atSettings ? "page" : undefined}
              className={`${ITEM} ${itemTone(atSettings)}`}
            >
              Settings
            </button>
          </li>
          {/* Ruled off: the two above stay inside the account, this one ends the
              session. Never current, whatever page you are on — it is an action,
              not somewhere to be. And a request rather than the action itself: it
              hands over to <LogoutConfirm>, so the row that reads like a navigation
              item cannot end a session on one press. */}
          <li className="border-hairline-on-light mt-2 border-t pt-2">
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={onLogOut}
              className={`${ITEM} ${itemTone(false)}`}
            >
              Log out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
