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
import {
  resendConfirmation,
  signIn,
  signUp,
  type Customer,
  type Refusal,
} from "../../_lib/auth";
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
  /** Report a sign-in upward: the header owns the answer, so it is what re-paints
   *  the account button. Signing back out is <AccountMenu>'s, which is what the
   *  avatar opens once there is a session to end. */
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

/** The treatment <Checkout> gives a refused order: a rule in the accent and a
 *  sentence, never colour alone, because the reason is the actionable part. Used
 *  by the form and by the confirmation screen, so it lives here rather than being
 *  typed twice — and as a plain literal, never through `cn()`, since `text-body`
 *  and `text-accent-on-light` share a tailwind-merge group and only the last of
 *  them would survive. */
const NOTICE =
  "border-accent-on-light text-body text-accent-on-light border-l-2 pl-4";

/**
 * A refusal as one sentence, with the moment it expires when the server told us
 * one. Formatted here rather than in the Server Action because `toLocaleTimeString`
 * reads the *browser's* clock and locale: the same instant is 11:37 PM in Karachi
 * and 6:37 PM on a UTC server, and the customer is only ever looking at the first.
 *
 * A time, not a countdown. The email quota these come from is hourly, so "at 11:37
 * PM" is something you can act on and "in 54 minutes" is something you would have
 * to keep watching — and unlike a countdown, a printed time cannot go stale while
 * the card sits open.
 */
function spoken({ message, retryAt }: Refusal) {
  if (!retryAt) return message;
  const at = new Date(retryAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${message} You can try again at ${at}.`;
}

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
  /** What the account will be greeted by, and where the avatar letter comes from.
   *  Sign-up only — logging in doesn't need it, and the server floors a missing one
   *  at the email address rather than refusing. */
  const [name, setName] = useState("");
  /** The server's refusal, in the customer's words. Held whole rather than as its
   *  sentence, because a throttled attempt also carries the moment it expires and
   *  only the browser can put that on the right clock. Cleared on every attempt
   *  and on the mode toggle, so a failed login can't sit above the Sign up button. */
  const [failure, setFailure] = useState<Refusal | null>(null);
  /** That the link went out again. Never shown beside a `failure`: each attempt
   *  clears both before it starts, so the confirmation screen reports the last
   *  press and not a history of them. */
  const [resent, setResent] = useState(false);
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
      setResent(false);
      // The address and the name are left alone — a mistyped password shouldn't
      // cost you either — but the password never outlives the open card.
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
      // Written out per mode rather than picking the action with a ternary: the two
      // no longer take the same arguments, since only sign-up has a name to send.
      const result =
        mode === "login"
          ? await signIn(email, password)
          : await signUp(email, password, name);

      if (!result.ok) {
        // The card stays exactly as it was, address included: the fix for a wrong
        // password is to retype it here.
        setFailure(result);
        return;
      }

      setPassword("");
      if (result.signedIn) onCustomer(result.customer);
      else setConfirmed(true);
    });
  };

  // The address the sign-up went out with: `email` is one of the two fields the
  // open-reset above deliberately leaves alone, and this screen is only ever
  // reached from a submit, so there is nothing to ask for again.
  const resend = () => {
    if (pending) return;
    setFailure(null);
    setResent(false);
    startTransition(async () => {
      const result = await resendConfirmation(email);
      if (result.ok) setResent(true);
      else setFailure(result);
    });
  };

  // Also the way off the confirmation screen, which is why it clears `confirmed`:
  // that screen now says "log in instead" for the address that already had an
  // account, and this is the only thing on the card that can honour it.
  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setConfirmed(false);
    setResent(false);
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
              {/* Dismissal, not an action — the only thing left to do here is get
                  back to shopping. Logging out lives in <AccountMenu>, which is
                  what the avatar opens from now on; offering it here would make
                  ending the session the one button someone sees a second after
                  starting it. */}
              <RippleButton onClick={onClose} silent>
                Continue
              </RippleButton>
            </div>
          ) : confirmed ? (
            <div className="mt-10 flex flex-col items-start gap-6">
              {/* Worded for both outcomes, because this screen cannot tell them
                  apart and must not try: GoTrue answers a sign-up for an address
                  that already has an account with the same silent success it gives
                  a new one, and sends nothing, precisely so that this card cannot
                  be used to ask whether someone is registered. Promising an email
                  unconditionally made that case look like mail that never arrived. */}
              <p className="text-body text-muted-on-light">
                If that address is new here, the link in your inbox finishes
                creating the account. If it already has one, nothing was sent —
                log in instead.
              </p>

              {/* Above the button, like the form's refusal: the press keeps
                  focus, so an announced region has to come before it to be
                  read in order. */}
              {failure && (
                <p role="alert" className={NOTICE}>
                  {spoken(failure)}
                </p>
              )}
              {resent && (
                <p role="status" className="text-body text-ink">
                  Sent again. Give it a minute to arrive, and check your spam
                  folder.
                </p>
              )}

              {/* Not the primary action on this screen — the link in the email
                  is — so it stays the width of its own label rather than the
                  card, the same weight the Log out button carries. */}
              <RippleButton onClick={resend} disabled={pending} silent>
                {pending ? "Sending…" : "Resend email"}
              </RippleButton>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
              {/* Sign-up only, and first: it is the one field that isn't a
                  credential, and asking for it after the password would read as an
                  afterthought. Logging in has an account to read the name off
                  already. */}
              {mode === "signup" && (
                <AppInput
                  label="Display name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={setName}
                />
              )}
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

              {/* The same treatment <Checkout> gives a refused order — see
                  `NOTICE`. `role="alert"` so it is announced; the submit button
                  keeps focus. */}
              {failure && (
                <p role="alert" className={NOTICE}>
                  {spoken(failure)}
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

          {/* Shown on the confirmation screen too, where it reads "Have an account?
              Log in" — without it that screen is a dead end for the one person who
              needs a way out of it, whose address was already registered. Only a
              live session hides it, since there is nothing to switch to. */}
          {!customer && (
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
