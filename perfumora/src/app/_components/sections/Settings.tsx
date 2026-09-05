"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  changePassword,
  updateName,
  type Customer,
  type Refusal,
} from "../../_lib/auth";
import { AppInput } from "../ui/AppInput";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { RippleButton } from "../ui/RippleButton";

/**
 * The micro-cap label, and the panel chrome the two forms sit in — <OrderCard>'s
 * border and radius, at a flat `p-6` rather than its `p-6 md:p-8`: an order card is
 * read one after another down a scroll, while these two have to share a screen with
 * the heading above them.
 * Plain literals rather than `cn()`: `text-micro` and `text-muted-on-light` share
 * one tailwind-merge group, so a merged string would keep only the last of them.
 */
const LABEL = "text-micro text-muted-on-light font-medium uppercase";
const PANEL = "border-hairline-on-light rounded-2xl border p-6";

/** The refusal treatment <Checkout> and <AuthModal> both give a rejected write: a
 *  rule in the accent and a sentence, never colour alone. Restated here rather than
 *  imported — those two hold their own copies, so a third local one is the house
 *  style, and lifting it into a shared module would be a refactor of two files this
 *  page was not asked to touch. */
const NOTICE =
  "border-accent-on-light text-body text-accent-on-light border-l-2 pl-4";

/**
 * A refusal as one sentence, with the moment it stops applying when the server sent
 * one. Formatted in the browser, like <AuthModal>'s copy of this, because
 * `toLocaleTimeString` reads the *reader's* clock: the same instant is 11:37 PM in
 * Karachi and 6:37 PM on a server running UTC.
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
 * What the account is called, and the address it was created with.
 *
 * Its own component, and so is the password below it, because each is one form with
 * its own pending state: sharing a `useTransition` would grey out both buttons
 * because one of them was pressed, and sharing a refusal would put the wrong
 * sentence under the wrong field.
 */
function DetailsPanel({ customer }: { customer: Customer }) {
  // `customer.name` is floored at the email address on the server, so an account
  // that never gave a name arrives here with its address in that field. Pre-filling
  // it would put an email in the display-name box and invite saving it as the name,
  // so the floor is recognised and the field starts empty instead. An account whose
  // name really is its address is the one false positive, and it costs nothing.
  const stored = customer.name === customer.email ? "" : customer.name;

  const [name, setName] = useState(stored);
  const [failure, setFailure] = useState<Refusal | null>(null);
  /** That the last press was accepted. Cleared the moment the field is edited
   *  again, so "Saved" never sits above a value that hasn't been. */
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const edit = (value: string) => {
    setName(value);
    setSaved(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Already covered by the button's `disabled`; this is the second lock, as in
    // <AuthModal>, since a double submit is a second write rather than a wasted one.
    if (pending) return;
    setFailure(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateName(name);
      if (result.ok) setSaved(true);
      else setFailure(result);
    });
  };

  // Four ways for the press to be a no-op: mid-flight, empty, already saved, or
  // still exactly what the page was rendered with.
  const unchanged = saved || !name.trim() || name.trim() === stored;

  return (
    <section className={PANEL}>
      {/* h3 under the page's h2, and Switzer rather than Khand: the base layer
          reserves the display face for h1/h2 (see globals.css §3.2), which is what
          keeps a panel title from competing with the heading it sits under. */}
      <h3 className="text-2xl font-medium tracking-tight">Your details</h3>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
        <AppInput
          label="Display name"
          required
          autoComplete="name"
          value={name}
          onChange={edit}
        />

        {/* Above the button, like <AuthModal>'s: the press keeps focus, so an
            announced region has to come before it to be read in order. */}
        {failure && (
          <p role="alert" className={NOTICE}>
            {spoken(failure)}
          </p>
        )}
        {saved && (
          <p role="status" className="text-body text-ink">
            Saved. That is the name we will greet you by.
          </p>
        )}

        {/* Sized to its label, not to the panel: it commits one field, and a
            full-width button reads as the page's primary action. */}
        <RippleButton
          type="submit"
          className="self-start"
          silent
          disabled={pending || unchanged}
        >
          {pending ? "Saving…" : "Save name"}
        </RippleButton>
      </form>

      {/* Stated read-only rather than shown as a disabled field: a greyed-out input
          looks like something that will unlock, and this one will not until a
          confirmation email has somewhere to land. */}
      <div className="border-hairline-on-light mt-6 border-t pt-5">
        <span className={LABEL}>Email</span>
        <p className="mt-2 text-base font-medium">{customer.email}</p>
        <p className="text-micro text-muted-on-light mt-2">
          The address an account was created with cannot be changed here yet.
        </p>
      </div>
    </section>
  );
}

/**
 * A new password, and the current one to prove it is the account holder asking.
 *
 * Nothing is validated here beyond both fields being filled: the length rule is
 * GoTrue's, it can be raised in the dashboard, and a second opinion in the browser
 * could only ever disagree with the authority. The server speaks whichever refusal
 * comes back.
 */
function PasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [failure, setFailure] = useState<Refusal | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    setSaved(false);

    startTransition(async () => {
      const result = await changePassword(current, next);
      if (!result.ok) {
        // The fields are left as they are: a rejected current password is retyped
        // here, and clearing the new one would cost them it as well.
        setFailure(result);
        return;
      }
      // Both cleared on success — neither is any use again, and a password should
      // not sit in a field behind whatever the customer does next.
      setCurrent("");
      setNext("");
      setSaved(true);
    });
  };

  /** Either field, plus dropping the acknowledgement — the same rule as the panel
   *  above, curried because there are two fields rather than one. */
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setSaved(false);
  };

  return (
    <section className={PANEL}>
      <h3 className="text-2xl font-medium tracking-tight">Password</h3>
      {/* One line at every width the two panels share a row, which is what keeps the
          page inside a screen: the reason is worth stating, the paragraph it used to
          be was not. */}
      <p className="text-body text-muted-on-light mt-2">
        Your current password confirms it is you asking.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
        {/* `current-password` then `new-password`, so a password manager offers the
            saved one in the first field and a generated one in the second rather
            than filling both with the same value. */}
        <AppInput
          label="Current password"
          variant="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={edit(setCurrent)}
        />
        <AppInput
          label="New password"
          variant="password"
          required
          autoComplete="new-password"
          value={next}
          onChange={edit(setNext)}
        />

        {failure && (
          <p role="alert" className={NOTICE}>
            {spoken(failure)}
          </p>
        )}
        {saved && (
          <p role="status" className="text-body text-ink">
            Changed. Use the new password next time you log in.
          </p>
        )}

        <RippleButton
          type="submit"
          className="self-start"
          silent
          disabled={pending || !current || !next}
        >
          {pending ? "Saving…" : "Change password"}
        </RippleButton>
      </form>
    </section>
  );
}

/**
 * The account's settings — the two things an account actually holds, since there is
 * no profile table behind the storefront: the name in `user_metadata` and the
 * password, both of them GoTrue's to write.
 *
 * `customer` arrives as a prop because the session is a cookie and cookies are the
 * server's, exactly as `/orders` hands its rows down. Never `null`: the route sends a
 * signed-out visitor home before any of this renders, so the prop is not optional and
 * there is no signed-out branch in here to be kept in step with the guard.
 *
 * The heading runs across the top and the panels sit in a grid beneath it —
 * <GalleryGrid>'s arrangement rather than <Checkout>'s heading-beside-content split.
 * The two panels are siblings of equal weight, so neither the page's subject nor a
 * column of supporting detail, and pairing them across the full measure keeps both
 * visible without a scroll. They only go side by side from `lg`: at `md` the pair
 * would leave a password field, reveal toggle included, about 260px wide.
 *
 * What is deliberately not here: changing the email address, which needs a
 * confirmation link that currently has nowhere to land; a saved delivery address,
 * which needs a table and policies of its own rather than a field; and deleting the
 * account, which no anon-key client can do.
 */
export function Settings({ customer }: { customer: Customer }) {
  return (
    <Container>
      <div>
        <Eyebrow>Your account</Eyebrow>
        <RevealHeading className="text-section mt-4 max-w-[18ch] text-balance">
          Settings
        </RevealHeading>
        {/* Placeholder copy — not brand-approved final wording. Kept to one line at
            `max-w-xl`, which is about 70 characters: the sentence that followed it
            said where an address is asked for, which the checkout already says. */}
        <p className="text-body text-muted-on-light mt-4 max-w-xl">
          How we address you, and the password that gets you in.
        </p>
      </div>

      {/* `mt-8 md:mt-10` between the heading and what it introduces — tighter than
          <GalleryGrid>'s `mt-14 md:mt-20`, which introduces a scroll rather than a
          page meant to be taken in at once.

          `items-stretch` is the grid's own default, written out because here it is a
          decision rather than an omission: both panels take the height of the taller
          one, so the pair reads as a single row instead of two cards that stop at
          different points. Content stays top-aligned inside, so the shorter panel
          carries its slack at the bottom. The cost is that a refusal appearing in one
          panel now grows the other's border with it — a ragged bottom edge on every
          render was the more visible of the two. Below `lg` there is one panel to a
          row, so none of this applies there. */}
      <div className="mt-8 grid items-stretch gap-6 md:mt-10 lg:grid-cols-2 lg:gap-8">
        <DetailsPanel customer={customer} />
        <PasswordPanel />
      </div>
    </Container>
  );
}
