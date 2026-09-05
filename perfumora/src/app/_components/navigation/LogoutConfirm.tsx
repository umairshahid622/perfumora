"use client";

import { useEffect, useId, useRef, useTransition } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { signOut } from "../../_lib/auth";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { RippleButton } from "../ui/RippleButton";

interface LogoutConfirmProps {
  open: boolean;
  /** Back out, session untouched. The scrim, Cancel and <Navigation>'s Escape all run
   *  through this one — three ways of saying no, and no difference between them. */
  onClose: () => void;
  /** Called once the session is actually gone, so <Navigation> can drop the customer
   *  and put the person icon back where the initial was. */
  onSignedOut: () => void;
}

/**
 * The question between the dropdown's "Log out" row and the end of the session.
 *
 * <AuthModal>'s overlay, near enough verbatim: the scrim fades, the card arrives from
 * 0.95, one paused timeline built on mount and played or reversed on `open`, and
 * `prefersReducedMotion()` cutting to the finished frame. The same entrance because
 * this arrives in the same place from the same button, and a second dialogue with a
 * motion of its own would read as a different application. Narrower than that card and
 * without its `md:p-10`: it asks one question, and a card sized for two fields and a
 * submit wrapped around a sentence looks like something failed to load into it.
 *
 * `role="alertdialog"` rather than `dialog` — the difference between a surface you
 * opened and a question you have to answer. It obliges a description, which is why the
 * heading and the sentence carry ids and the card points at both: a screen reader then
 * announces the warning along with the title instead of leaving it to be explored.
 *
 * Ending the session lives here and no longer in <AccountMenu>: the press that does it
 * and the words warning about it belong in one component, and by the time this is on
 * screen that dropdown is retracting. What it does not own is the consequence —
 * <Navigation> holds the customer, so this reports upward exactly as <AuthModal>
 * reports a sign-in.
 *
 * No focus trap, as with the rest of the overlays here: Tab can leave the card. That
 * is a gap this file inherits rather than one it introduces.
 */
export function LogoutConfirm({
  open,
  onClose,
  onSignedOut,
}: LogoutConfirmProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [pending, startTransition] = useTransition();
  /** One base for the two ids `aria-labelledby` and `aria-describedby` need, rather
   *  than literals that would collide if this were ever mounted twice. */
  const id = useId();

  useGSAP(
    () => {
      gsap.set(scrimRef.current, { autoAlpha: 0 });
      gsap.set(cardRef.current, { autoAlpha: 0, scale: 0.95 });
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "power3.out" },
        // Focus taken when the card has finished arriving rather than beside `play()`:
        // `autoAlpha` parks it at `visibility: hidden`, GSAP renders the first frame on
        // its next tick, and a hidden element cannot take focus. Cancel and not the
        // button that logs out — the keypress that opened this came from a button, and
        // a held or repeated Enter must not be able to end a session by itself.
        onComplete: () => cancelRef.current?.focus(),
      });
      tl.to(scrimRef.current, { autoAlpha: 1, duration: 0.35 }, 0).to(
        cardRef.current,
        { autoAlpha: 1, scale: 1, duration: 0.45 },
        0.05,
      );
      timeline.current = tl;
    },
    { scope: rootRef },
  );

  useEffect(() => {
    const tl = timeline.current;
    if (!tl) return;
    if (prefersReducedMotion()) {
      // `progress()` does not run `onComplete`, so the focus above is taken here.
      tl.progress(open ? 1 : 0).pause();
      if (open) cancelRef.current?.focus();
      return;
    }
    if (open) tl.play();
    else tl.reverse();
  }, [open]);

  const confirm = () => {
    // Second lock behind the button's own `disabled`, as in <AuthModal>: a double press
    // is a second request rather than a wasted one.
    if (pending) return;
    startTransition(async () => {
      await signOut();
      // No refusal branch: `signOut()` returns nothing and is safe to call with no
      // session, so there is nothing here that can fail in a way worth a sentence.
      onSignedOut();
    });
  };

  return (
    // `inert` closed, which <AuthModal> has no equivalent of: both cards keep their
    // buttons mounted so a close animation is never cut off, but a "Log out" that Tab
    // can reach through a card nobody can see is the one worth ruling out. It covers
    // the scrim's `tabIndex` too — kept anyway, since it is the idiom the other
    // overlays are read in.
    <div ref={rootRef} inert={!open} aria-hidden={!open}>
      <button
        ref={scrimRef}
        type="button"
        aria-label="Cancel"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      />

      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
        <div
          ref={cardRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-copy`}
          className={cn(
            "bg-bg-light text-ink relative w-full max-w-sm rounded-3xl p-8",
            open ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          {/* No X in the corner, unlike <AuthModal>: Cancel is already the way out, and
              two of them a few centimetres apart invites the reading that they do
              different things. */}
          <h2
            id={`${id}-title`}
            className="text-3xl font-medium tracking-tight normal-case"
          >
            Log out?
          </h2>
          {/* Placeholder copy — not brand-approved final wording. What it is for: a
              warning is only worth showing if it says what is and is not lost, and
              nothing here is — the bag lives in `localStorage`, not in the session. */}
          <p id={`${id}-copy`} className="text-body text-muted-on-light mt-3">
            This ends your session on this device. Your orders and details stay on
            your account, and your bag stays in this browser.
          </p>

          {/* The ripple button carries the action and the micro-caps text the way out,
              which is <AuthModal>'s pairing — in a row rather than stacked, since a
              question with two answers should show both at once. `flex-wrap` with a
              row gap for the narrowest phones, where the pair does not fit a line. */}
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <RippleButton onClick={confirm} disabled={pending} silent>
              {pending ? "Logging out…" : "Log out"}
            </RippleButton>
            <button
              ref={cancelRef}
              type="button"
              onClick={onClose}
              disabled={pending}
              className="text-micro text-muted-on-light hover:text-ink font-medium uppercase transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
