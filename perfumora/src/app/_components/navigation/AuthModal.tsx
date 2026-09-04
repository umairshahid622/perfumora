"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { signIn, signOut, signUp, type Customer } from "../../_lib/auth";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { AppInput } from "../ui/AppInput";
import { RippleButton } from "../ui/RippleButton";
import { CloseIcon } from "./icons";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Who the header has signed in, or `null`. The card reads its signed-in state
   *  from this rather than keeping a second copy that could disagree. */
  customer: Customer | null;
  /** Report a sign-in or sign-out upward: the header owns the answer, so it is
   *  what re-paints the account button. */
  onCustomer: (customer: Customer | null) => void;
}

type Mode = "login" | "signup";

/** Two lines of copy per state — a signed-in session speaks first, then a new
 *  account waiting on its confirmation email, otherwise the mode does. A lookup
 *  rather than nested ternaries, since there are four. */
const COPY = {
  "signed-in": { heading: "Your account", eyebrow: "Signed in" },
  confirm: { heading: "Almost there", eyebrow: "One more step" },
  login: { heading: "Welcome back", eyebrow: "Log in to continue" },
  signup: { heading: "Create account", eyebrow: "Join Perfumora" },
} as const;

/**
 * Auth modal (§4.0): a centered overlay that scales/fades in via GSAP (scrim
 * fade + card 0.95 → 1, opacity 0 → 1), not a native <dialog>. Minimal email /
 * password fields with a login⇄signup toggle.
 *
 * Wired to Supabase through the Server Actions in `_lib/auth.ts`, the same shape
 * <Checkout> uses for `placeOrder`: the handler awaits one, and a refusal comes
 * back as a sentence to show rather than a throw. Who is signed in is not held
 * here — it is a cookie, so <Navigation> asks the server each time the card opens
 * and hands the answer down, which is also what lets the account button wear the
 * customer's initial.
 */
export function AuthModal({
  open,
  onClose,
  customer,
  onCustomer,
}: AuthModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  /** A sign-up that took the address but withheld the session, so the card shows
   *  "check your inbox" in place of the form. Local, because it is about this one
   *  attempt rather than about who is signed in. */
  const [confirmed, setConfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** The server's refusal, in the customer's words. Cleared on every attempt and
   *  on the mode toggle, so a failed login can't sit above the Sign up button. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useGSAP(
    () => {
      gsap.set(scrimRef.current, { autoAlpha: 0 });
      gsap.set(cardRef.current, { autoAlpha: 0, scale: 0.95 });
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
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
      tl.progress(open ? 1 : 0).pause();
      return;
    }
    if (open) tl.play();
    else tl.reverse();
  }, [open]);

  // Clearing the card as it opens, during render rather than from an effect: this
  // is React's own prescription for adjusting state when a prop changes, and it
  // covers every way the card can be dismissed — the X, the scrim, Escape and a
  // browser Back all run through `open`. An effect here would be the cascading
  // render the `set-state-in-effect` rule is about.
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setConfirmed(false);
      setFailure(null);
      // The address is left alone — a mistyped password shouldn't cost you the
      // email as well — but the password never outlives the open card.
      setPassword("");
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Already reflected in the button's `disabled`; this is the second lock, since
    // a double submit is a second sign-up attempt rather than a wasted one.
    if (pending) return;
    setFailure(null);

    startTransition(async () => {
      const result = await (mode === "login" ? signIn : signUp)(email, password);

      if (!result.ok) {
        // The card stays exactly as it was, address included: the fix for a wrong
        // password is to retype it here.
        setFailure(result.message);
        return;
      }

      setPassword("");
      if (result.signedIn) onCustomer(result.customer);
      else setConfirmed(true);
    });
  };

  const logOut = () => {
    if (pending) return;
    startTransition(async () => {
      await signOut();
      onCustomer(null);
    });
  };

  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setFailure(null);
  };

  const copy = COPY[customer ? "signed-in" : confirmed ? "confirm" : mode];

  return (
    <div ref={rootRef} aria-hidden={!open}>
      <button
        ref={scrimRef}
        type="button"
        aria-label="Close"
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
          role="dialog"
          aria-modal="true"
          aria-label={copy.heading}
          className={cn(
            "bg-bg-light text-ink relative w-full max-w-md rounded-3xl p-8 md:p-10",
            open ? "pointer-events-auto" : "pointer-events-none",
          )}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink hover:text-accent-on-light absolute top-6 right-6 transition-colors"
          >
            <CloseIcon className="size-5" />
          </button>

          <h2 className="text-3xl font-medium tracking-tight normal-case">
            {copy.heading}
          </h2>
          <p className="text-micro text-muted-on-light mt-2 font-medium uppercase">
            {copy.eyebrow}
          </p>

          {customer ? (
            <div className="mt-8 flex flex-col items-start gap-6">
              {/* `name` falls back to the address server-side, so this one line
                  greets an account that has a name and identifies one that
                  doesn't. */}
              <p className="text-body text-muted-on-light">
                Signed in as <span className="text-ink">{customer.name}</span>.
              </p>
              <RippleButton onClick={logOut} disabled={pending} silent>
                {pending ? "Logging out…" : "Log out"}
              </RippleButton>
            </div>
          ) : confirmed ? (
            <p className="text-body text-muted-on-light mt-10">
              Check your inbox — the link in that email finishes creating your
              account.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
              <AppInput
                label="Email"
                variant="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={setEmail}
              />
              <AppInput
                label="Password"
                variant="password"
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={setPassword}
              />

              {/* The same treatment <Checkout> gives a refused order: a rule in
                  the accent and a sentence, never colour alone, because the
                  reason is the actionable part. `role="alert"` so it is
                  announced — the submit button keeps focus. */}
              {failure && (
                <p
                  role="alert"
                  className="border-accent-on-light text-body text-accent-on-light border-l-2 pl-4"
                >
                  {failure}
                </p>
              )}

              <RippleButton
                type="submit"
                className="mt-2 w-full"
                silent
                disabled={pending}
              >
                {pending
                  ? mode === "login"
                    ? "Logging in…"
                    : "Signing up…"
                  : mode === "login"
                    ? "Log in"
                    : "Sign up"}
              </RippleButton>
            </form>
          )}

          {!customer && !confirmed && (
            <button
              type="button"
              onClick={switchMode}
              className="text-micro text-muted-on-light hover:text-ink mt-6 font-medium uppercase transition-colors"
            >
              {mode === "login"
                ? "Need an account? Sign up"
                : "Have an account? Log in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
