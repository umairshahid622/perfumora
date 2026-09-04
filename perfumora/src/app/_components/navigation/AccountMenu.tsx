"use client";

import { useEffect, useRef, useTransition } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { signOut } from "../../_lib/auth";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";

interface AccountMenuProps {
  open: boolean;
  onClose: () => void;
  /** Called once the session is actually gone, so <Navigation> can drop the
   *  customer and put the person icon back where the initial was. */
  onSignedOut: () => void;
}

/**
 * One row. Deliberately not run through `cn()` and not merged with the callers'
 * classes: tailwind-merge reads `text-micro` (a size) and `text-accent-on-light`
 * (a colour) as one `text-*` conflict and keeps only the last, which drops the
 * size — the same trap `CENTRE_LINK` in <Navigation> documents. `min-h-11` is the
 * 44px touch floor, since micro caps are far shorter than that on their own.
 */
const ITEM =
  "text-micro hover:text-accent-on-light flex min-h-11 w-full items-center px-5 text-left font-medium uppercase transition-colors";

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
 *
 * Only "Log out" does anything yet. The other two are the rows the account work
 * will land on, so they dismiss the panel and go nowhere for now.
 */
export function AccountMenu({ open, onClose, onSignedOut }: AccountMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [pending, startTransition] = useTransition();

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

  const logOut = () => {
    if (pending) return;
    startTransition(async () => {
      await signOut();
      onSignedOut();
    });
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
              onClick={onClose}
              className={ITEM}
            >
              Your orders
            </button>
          </li>
          <li>
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={onClose}
              className={ITEM}
            >
              Settings
            </button>
          </li>
          {/* Ruled off: the two above go somewhere, this one ends the session. */}
          <li className="border-hairline-on-light mt-2 border-t pt-2">
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={logOut}
              disabled={pending}
              className={ITEM}
            >
              {pending ? "Logging out…" : "Log out"}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
