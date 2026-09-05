"use client";

import { useState, useTransition, type FormEvent } from "react";
import { resetPassword, type Customer, type Refusal } from "../../_lib/auth";
import { useRouteTransition } from "../providers/RouteTransition";
import { AppInput } from "../ui/AppInput";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { RippleButton } from "../ui/RippleButton";

/** <Settings>' panel chrome and its refusal treatment, restated here for the reason
 *  that file gives for restating <AuthModal>'s: each page keeps its own copy. Plain
 *  literals rather than `cn()` — `text-body` and `text-accent-on-light` share one
 *  tailwind-merge group, so a merged string would keep only the last of them. */
const PANEL = "border-hairline-on-light rounded-2xl border p-6";
const NOTICE =
  "border-accent-on-light text-body text-accent-on-light border-l-2 pl-4";

/**
 * The one thing this form is entitled to judge. Both boxes are ours, so comparing them
 * is not a second opinion on GoTrue's rules the way a length check would be — and it is
 * worth judging, because a typo here is not a wasted attempt: the link is spent on the
 * way in, so getting it wrong costs another email.
 *
 * Shaped as a `Refusal` so it prints through the same notice as the server's, rather
 * than a second kind of message with a second place to appear.
 */
const MISMATCH: Refusal = {
  ok: false,
  message: "Those two passwords don't match.",
};

/** A refusal as one sentence, with the moment it stops applying — the copy <Settings>
 *  and <AuthModal> both hold, formatted in the browser so the time is on the reader's
 *  clock and not the server's. */
function spoken({ message, retryAt }: Refusal) {
  if (!retryAt) return message;
  const at = new Date(retryAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${message} You can try again at ${at}.`;
}

/**
 * The end of the forgotten-password walk: the form the emailed link leads to.
 *
 * No token in sight, which is the point of the shape `/auth/confirm` chose. That route
 * spends the `token_hash` and writes a session, `recoveringCustomer()` in the route
 * above confirms the session came from a link, and by the time this renders there is
 * nothing left to carry — so nothing sits in the address bar to be shoulder-read, kept
 * in browser history, or expire while somebody is still typing.
 *
 * One column and one panel, unlike <Settings>' pair: there is a single thing to do
 * here. `max-w-md` because a password field with a reveal toggle inside half a grid is
 * the width <Settings> already flags as too narrow, and this page has no second panel
 * to justify going there.
 *
 * A client component for the form, and for the button on the far side of it: leaving a
 * page here means the curtain in {@link useRouteTransition} rather than an <a>.
 */
export function ResetPassword({ customer }: { customer: Customer }) {
  const { navigate } = useRouteTransition();
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [failure, setFailure] = useState<Refusal | null>(null);
  /** That the password is changed, and the form has nothing left to do. Its own state
   *  rather than an absent failure: this swaps the form out, and the link behind it is
   *  already spent, so there is no second attempt to leave the fields standing for. */
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Second lock behind the button's `disabled`, as in <Settings>: a double press is
    // a second write rather than a wasted one.
    if (pending) return;
    setFailure(null);

    // Judged on the press, not while typing: a mismatch shown under a half-typed
    // second field is noise, and an announced one would be read out per keystroke.
    if (next !== again) {
      setFailure(MISMATCH);
      return;
    }

    startTransition(async () => {
      const result = await resetPassword(next);
      if (!result.ok) {
        // Fields left as they are. The refusals that reach here are about the password
        // itself — too short for GoTrue, or the same as the old one — so it is the
        // thing to edit rather than to retype.
        setFailure(result);
        return;
      }
      setNext("");
      setAgain("");
      setDone(true);
    });
  };

  return (
    <Container>
      <div className="max-w-xl">
        <Eyebrow>Your account</Eyebrow>
        <RevealHeading className="text-section mt-4 max-w-[16ch] text-balance">
          New password
        </RevealHeading>
        {/* The account is named rather than assumed. The link was opened out of a
            mailbox, and somebody with two addresses should see which one they are about
            to change before they type into it. */}
        <p className="text-body text-muted-on-light mt-4">
          Setting a new password for{" "}
          <span className="text-ink font-medium">{customer.email}</span>.
        </p>
      </div>

      <div className={`${PANEL} mt-8 max-w-md md:mt-10`}>
        {done ? (
          <div className="flex flex-col items-start gap-5">
            {/* h3 under the page's h2, Switzer rather than Khand — the base layer
                reserves the display face for h1/h2 (globals.css §3.2). */}
            <h3 className="text-2xl font-medium tracking-tight">
              Password changed
            </h3>
            {/* Announced, since this replaced the form the press came from and focus
                has nowhere to have landed. */}
            <p role="status" className="text-body text-muted-on-light">
              You are signed in on this device. Use the new password next time you
              log in.
            </p>
            <RippleButton
              onClick={() => navigate("/")}
              aria-label="Back to the shop"
            >
              Back to the shop
            </RippleButton>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            {/* `new-password` on both, so a password manager offers to generate and
                then to repeat, rather than filling either with the saved one — which
                is the password that has just been forgotten. */}
            <AppInput
              label="New password"
              variant="password"
              required
              autoComplete="new-password"
              value={next}
              onChange={setNext}
            />
            <AppInput
              label="Confirm new password"
              variant="password"
              required
              autoComplete="new-password"
              value={again}
              onChange={setAgain}
            />

            {/* Above the button, as everywhere else here: the press keeps focus, so an
                announced region has to come before it to be read in order. */}
            {failure && (
              <p role="alert" className={NOTICE}>
                {spoken(failure)}
              </p>
            )}

            <RippleButton
              type="submit"
              className="self-start"
              silent
              disabled={pending || !next || !again}
            >
              {pending ? "Saving…" : "Set new password"}
            </RippleButton>
          </form>
        )}
      </div>
    </Container>
  );
}
