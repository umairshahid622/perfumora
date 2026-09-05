"use server";

import type { AuthError, User } from "@supabase/supabase-js";
import { supabaseAuth, type AuthMeta } from "./supabase-auth";

/* ---------------------------------------------------------------------------
   Signing a customer in, out and up, and letting them change the two things an
   account holds — the storefront's second write.

   A `"use server"` module, so <AuthModal> can `await signIn(...)` from its
   submit handler exactly as <Checkout> awaits `placeOrder`. Same consequence as
   there: every export below is a public HTTP endpoint, reachable by POST from
   anywhere rather than only through our own modal, so the fields are re-checked
   and bounded here and not trusted from the form's `required`.

   What is deliberately *not* here is any notion of who may do what. The role
   lives in `user_roles` and is read by `is_admin()` inside the policies
   (perfumora-admin/supabase/schema.sql), which means a customer's rights are
   decided by Postgres on every query. Nothing in this file grants anything: it
   only establishes which `auth.uid()` the policies will see. A new account has
   no `user_roles` row, and no row means customer — so the default is the least
   privilege by construction, with no trigger on `auth.users` that could break
   sign-up if it went wrong.

   The session is a cookie, set by GoTrue through `supabaseAuth()`. Reading it
   back is `currentCustomer()`, which asks the auth server to validate the token
   rather than trusting what the cookie claims.
--------------------------------------------------------------------------- */

/** Ceilings, not preferences — same reasoning as `orders.ts`. 254 is the longest
 *  legal email address; 72 bytes is where bcrypt stops reading, and GoTrue
 *  refuses anything longer outright rather than silently truncating. 64 for the
 *  display name has no standard behind it: it is simply past any real name and
 *  short of what would make `user_metadata` a place to store things. */
const LIMITS = { email: 254, password: 72, name: 64 };

/**
 * Who is signed in, as the storefront needs them: an address to show and a name
 * to greet them by. `name` is never empty — the address is its floor — so the
 * header can take its avatar letter from the first character without checking.
 */
export interface Customer {
  email: string;
  name: string;
}

/**
 * A refusal, and when it stops being one. `retryAt` is unix milliseconds rather
 * than a formatted string on purpose: the wait belongs on the customer's clock,
 * and this module runs in whatever timezone the server happens to be in — Vercel
 * is UTC, Umair is UTC+5 — so formatting here would have shown a time five hours
 * off. The card formats it.
 */
export interface Refusal {
  ok: false;
  message: string;
  /** Only set when the server sent a `Retry-After`, so absence means unknown
   *  rather than "now". */
  retryAt?: number;
}

export type AuthResult =
  /** Signed in — the session cookies are set and `customer` is the live account. */
  | { ok: true; signedIn: true; customer: Customer }
  /** Account taken, but it needs the emailed link before it can sign in. */
  | { ok: true; signedIn: false }
  | Refusal;

/** Resending the confirmation link has no session either way, so it answers with
 *  the refusal half of `AuthResult` and a bare acknowledgement rather than
 *  borrowing a `signedIn` flag that could never be true. */
export type ResendResult = { ok: true } | Refusal;

/** Changing a name or a password has the same two outcomes and, structurally, the
 *  same type as `ResendResult` — kept apart so neither name has to stretch to
 *  cover the other, and so a later "we sent you a link" branch can be added to one
 *  without touching the other's callers. */
export type UpdateResult = { ok: true } | Refusal;

/** Shown when we cannot explain the refusal — a raw GoTrue message can name
 *  internals, so it goes to the server log instead. */
const GENERIC = "Something went wrong on our end. Please try again.";
const MISSING = "Please enter your email address and password.";
const NO_EMAIL = "Please enter your email address.";

/* The settings writes need a live session, and a new password needs the old one —
   three refusals no part of signing in ever has to make. Both `LONG_` messages are
   only reachable by a paste or a direct POST, since no field here is near its
   ceiling, but a silent truncation of either would be worse than a sentence. */
const SIGNED_OUT = "Your session has ended. Please log in again.";
const NO_NAME = "Please enter a display name.";
const LONG_NAME = "Please pick a shorter display name.";
const NO_PASSWORDS = "Please enter your current password and a new one.";
const LONG_PASSWORD = "Please pick a shorter password — 72 characters at most.";
const WRONG_PASSWORD = "That isn't your current password.";

/**
 * The refusals a customer can actually act on, keyed by GoTrue's stable error
 * code rather than its prose. Anything absent here is either our bug or theirs,
 * and is answered with `GENERIC` — the same split `orders.ts` makes.
 */
const SPOKEN: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account.",
  email_not_confirmed:
    "Confirm your email address first — the link is in your inbox.",
  // Not reachable while public sign-ups are on, which they now are — kept because
  // the setting is a checkbox in the dashboard and can go back.
  signup_disabled: "New accounts aren't open yet. Please check back shortly.",
  email_exists: "That email already has an account — log in instead.",
  user_already_exists: "That email already has an account — log in instead.",
  weak_password: "Pick a longer password — at least six characters.",
  // Only `changePassword` can raise this, and only when GoTrue is configured to
  // refuse a repeat; the check is on their side, so we speak it rather than
  // comparing the two strings here.
  same_password: "Your new password has to be different from the old one.",
  // Both rate limits, worded so they read as complete sentences on their own and
  // still read correctly with "You can try again at …" appended. Neither names a
  // duration any more: the two windows are nothing alike — this one is per-IP and
  // measured in minutes, the email one is the project's whole hourly quota — and
  // guessing wrong is what made a throttle look like a broken form.
  over_request_rate_limit: "Too many attempts from this connection.",
  over_email_send_rate_limit: "We can't send another email just yet.",
  validation_failed: MISSING,
};

/** Bound and re-check the pair, or `null` when there is nothing worth sending. */
function credentials(email: unknown, password: unknown) {
  const address = typeof email === "string" ? email.trim() : "";
  const secret = typeof password === "string" ? password : "";
  if (!address || address.length > LIMITS.email) return null;
  if (!secret || secret.length > LIMITS.password) return null;
  return { email: address, password: secret };
}

/**
 * The account as the header and the card show it. The name is whatever GoTrue was
 * handed, and the key it sits under depends on who wrote the row: `full_name` is
 * what `signUp` writes below, along with the admin API and most OAuth providers;
 * `display_name` is what the Supabase dashboard writes; `name` is what some
 * providers send instead. None is guaranteed — an account made before the sign-up
 * form asked for a name carries no key at all — so the address itself is the last
 * resort rather than a blank.
 */
function customerFrom(user: User | null, fallback: string): Customer {
  const email = user?.email ?? fallback;
  const meta: Record<string, unknown> = user?.user_metadata ?? {};
  for (const key of ["full_name", "display_name", "name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) {
      return { email, name: value.trim() };
    }
  }
  return { email, name: email };
}

/** The shared refusal, narrowed to the one branch every caller can return: both
 *  `AuthResult` and `ResendResult` carry it. `meta` is whatever the 429 said, so
 *  a throttled attempt comes back with the moment it can be repeated instead of a
 *  guess at how long to sit there. */
function refused(error: AuthError, where: string, meta: AuthMeta): Refusal {
  const spoken = error.code ? SPOKEN[error.code] : undefined;
  if (!spoken) {
    console.error(`${where} failed:`, error.code ?? "no code", error.message);
  }
  return {
    ok: false,
    message: spoken ?? GENERIC,
    // Rounded up to the next second so the stated time is never a hair early,
    // which would send the customer straight back into the same refusal.
    ...(meta.retryAfter
      ? { retryAt: Date.now() + Math.ceil(meta.retryAfter) * 1000 }
      : {}),
  };
}

/** Exchange a password for a session cookie. Never throws. */
export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  const creds = credentials(email, password);
  if (!creds) return { ok: false, message: MISSING };

  const meta: AuthMeta = {};
  const supabase = await supabaseAuth(meta);
  const { data, error } = await supabase.auth.signInWithPassword(creds);
  if (error) return refused(error, "signIn", meta);

  return {
    ok: true,
    signedIn: true,
    customer: customerFrom(data.user, creds.email),
  };
}

/** Register a new customer. Never throws. */
export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<AuthResult> {
  const creds = credentials(email, password);
  if (!creds) return { ok: false, message: MISSING };

  // Trimmed and bounded like the pair above, but a name that fails either test is
  // dropped rather than refused: `customerFrom` already floors the name at the email
  // address, so a blank one costs nothing, and no real display name runs to 64
  // characters — only a POST straight at this endpoint would.
  const given = typeof name === "string" ? name.trim() : "";
  const stored = given && given.length <= LIMITS.name ? given : null;

  const meta: AuthMeta = {};
  const supabase = await supabaseAuth(meta);
  const { data, error } = await supabase.auth.signUp({
    ...creds,
    // `full_name` rather than `display_name`: it is the key `customerFrom` reads
    // first, what GoTrue's email templates and most providers use, and what the
    // accounts already in this project carry. Left off entirely when there is no
    // name, so the metadata never holds an empty one.
    options: stored ? { data: { full_name: stored } } : undefined,
  });
  if (error) return refused(error, "signUp", meta);

  // Two honest outcomes, decided by the project's "Confirm email" setting: with
  // it on, GoTrue creates the user and withholds the session until the link is
  // clicked; with it off, the cookies are already set and they are simply in.
  //
  // The session is also withheld — with no error — when the address already has
  // an account, so that a stranger cannot use this endpoint to discover who is
  // registered. That is deliberate on GoTrue's part and we pass it through: both
  // cases show "check your inbox", which is true of both.
  if (!data.session) return { ok: true, signedIn: false };

  return {
    ok: true,
    signedIn: true,
    customer: customerFrom(data.user, creds.email),
  };
}

/**
 * Send the confirmation link again, for the account that signed up and never got
 * the email. Never throws.
 *
 * What it will not say is whether that address has an account, or whether the
 * account is already confirmed. Neither code is in `SPOKEN`, so either comes back
 * as `GENERIC` — this is the one screen that could otherwise be used to ask "is
 * this person registered?", which is precisely what `signUp` above is careful not
 * to answer.
 */
export async function resendConfirmation(email: string): Promise<ResendResult> {
  // Bounded like `credentials` bounds the pair, and for the same reason: reachable
  // by POST from anywhere. Nothing checks the shape of the address — GoTrue is the
  // authority on that, and a second opinion here could only disagree with it.
  const address = typeof email === "string" ? email.trim() : "";
  if (!address || address.length > LIMITS.email) {
    return { ok: false, message: NO_EMAIL };
  }

  const meta: AuthMeta = {};
  const supabase = await supabaseAuth(meta);
  // No `emailRedirectTo`, matching `signUp`: both then fall back to the project's
  // Site URL, so the second link lands exactly where the first one would have.
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: address,
  });
  if (error) return refused(error, "resendConfirmation", meta);

  return { ok: true };
}

/**
 * Change the name the storefront greets them by. Never throws.
 *
 * Writes `user_metadata.full_name` — the key `signUp` writes and the first one
 * `customerFrom` reads, so the change shows up everywhere a name is shown at once.
 *
 * An empty name is refused rather than stored. `customerFrom` floors a missing name
 * at the email address, so clearing it would not blank the greeting: it would put
 * their address in the header and on the checkout form, which is not what anyone
 * emptying a field is asking for.
 */
export async function updateName(name: string): Promise<UpdateResult> {
  const given = typeof name === "string" ? name.trim() : "";
  if (!given) return { ok: false, message: NO_NAME };
  if (given.length > LIMITS.name) return { ok: false, message: LONG_NAME };

  const meta: AuthMeta = {};
  const supabase = await supabaseAuth(meta);
  // Asked before the write, so a cookie that expired between rendering the page
  // and pressing save is spoken as "log in again" instead of arriving as GENERIC
  // from a refusal we could not have explained.
  const { data: account } = await supabase.auth.getUser();
  if (!account.user) return { ok: false, message: SIGNED_OUT };

  const { error } = await supabase.auth.updateUser({
    data: { full_name: given },
  });
  if (error) return refused(error, "updateName", meta);

  return { ok: true };
}

/**
 * Change the password. Never throws.
 *
 * The current one is required, and checked by signing in with it before anything is
 * written. A session cookie on its own is not proof of the person — an unlocked
 * laptop, or a machine someone forgot to log out of, would otherwise be enough to
 * take the account over and lock its owner out. GoTrue can be told to demand this
 * itself ("Secure password change" in the dashboard), but that is a checkbox in a
 * UI, so the rule is enforced here where it cannot be unticked.
 *
 * Re-authenticating on this same client is deliberate: a correct current password
 * refreshes the very cookies the request arrived with, so the customer is left as
 * signed in as they started.
 */
export async function changePassword(
  current: string,
  next: string,
): Promise<UpdateResult> {
  const now = typeof current === "string" ? current : "";
  const wanted = typeof next === "string" ? next : "";
  if (!now || !wanted) return { ok: false, message: NO_PASSWORDS };
  if (now.length > LIMITS.password || wanted.length > LIMITS.password) {
    return { ok: false, message: LONG_PASSWORD };
  }

  const meta: AuthMeta = {};
  const supabase = await supabaseAuth(meta);
  // The address to re-authenticate against comes from the session, never from the
  // form: this endpoint must not become a way to test a password against an email
  // somebody else owns.
  const { data: account } = await supabase.auth.getUser();
  const email = account.user?.email;
  if (!email) return { ok: false, message: SIGNED_OUT };

  const { error: mismatch } = await supabase.auth.signInWithPassword({
    email,
    password: now,
  });
  if (mismatch) {
    // Its own sentence rather than SPOKEN's, which reads "that email and password
    // don't match an account" — an email this form never asked for. Everything
    // else still goes through `refused`, so a rate limit here comes back with the
    // moment it can be retried like every other one.
    if (mismatch.code === "invalid_credentials") {
      return { ok: false, message: WRONG_PASSWORD };
    }
    return refused(mismatch, "changePassword (re-auth)", meta);
  }

  const { error } = await supabase.auth.updateUser({ password: wanted });
  if (error) return refused(error, "changePassword", meta);

  return { ok: true };
}

/** Drop the session cookies. Safe to call with no session. */
export async function signOut(): Promise<void> {
  const supabase = await supabaseAuth();
  await supabase.auth.signOut();
}

/**
 * Who is signed in, or `null`. `getUser()` rather than `getSession()`: the
 * former asks the auth server to validate the token, while the latter reports
 * what the cookie says about itself — fine for painting a nav icon, not for
 * anything that decides access.
 */
export async function currentCustomer(): Promise<Customer | null> {
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.getUser();
  // A missing session is the common case, not a fault: nothing to log.
  if (error || !data.user?.email) return null;
  return customerFrom(data.user, data.user.email);
}
