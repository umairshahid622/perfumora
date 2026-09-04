"use server";

import type { AuthError, User } from "@supabase/supabase-js";
import { supabaseAuth } from "./supabase-auth";

/* ---------------------------------------------------------------------------
   Signing a customer in, out, and up — the storefront's second write.

   A `"use server"` module, so <AuthModal> can `await signIn(...)` from its
   submit handler exactly as <Checkout> awaits `placeOrder`. Same consequence as
   there: every export below is a public HTTP endpoint, reachable by POST from
   anywhere rather than only through our own modal, so the two fields are
   re-checked and bounded here and not trusted from the form's `required`.

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
 *  refuses anything longer outright rather than silently truncating. */
const LIMITS = { email: 254, password: 72 };

/**
 * Who is signed in, as the storefront needs them: an address to show and a name
 * to greet them by. `name` is never empty — the address is its floor — so the
 * header can take its avatar letter from the first character without checking.
 */
export interface Customer {
  email: string;
  name: string;
}

export type AuthResult =
  /** Signed in — the session cookies are set and `customer` is the live account. */
  | { ok: true; signedIn: true; customer: Customer }
  /** Account taken, but it needs the emailed link before it can sign in. */
  | { ok: true; signedIn: false }
  | { ok: false; message: string };

/** Shown when we cannot explain the refusal — a raw GoTrue message can name
 *  internals, so it goes to the server log instead. */
const GENERIC = "Something went wrong on our end. Please try again.";
const MISSING = "Please enter your email address and password.";

/**
 * The refusals a customer can actually act on, keyed by GoTrue's stable error
 * code rather than its prose. Anything absent here is either our bug or theirs,
 * and is answered with `GENERIC` — the same split `orders.ts` makes.
 */
const SPOKEN: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account.",
  email_not_confirmed:
    "Confirm your email address first — the link is in your inbox.",
  // The live state today: public sign-ups stay off until the role work in
  // schema.sql has been applied, because every new policy depends on it.
  signup_disabled: "New accounts aren't open yet. Please check back shortly.",
  email_exists: "That email already has an account — log in instead.",
  user_already_exists: "That email already has an account — log in instead.",
  weak_password: "Pick a longer password — at least six characters.",
  over_request_rate_limit: "Too many attempts. Wait a minute, then try again.",
  over_email_send_rate_limit:
    "Too many attempts. Wait a minute, then try again.",
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
 * what the admin API and most OAuth providers use, `display_name` is what the
 * Supabase dashboard writes, `name` is what some providers send instead. None is
 * guaranteed — signing up here asks for an address and a password only — so the
 * address itself is the last resort rather than a blank.
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

function refused(error: AuthError, where: string): AuthResult {
  const spoken = error.code ? SPOKEN[error.code] : undefined;
  if (!spoken) {
    console.error(`${where} failed:`, error.code ?? "no code", error.message);
  }
  return { ok: false, message: spoken ?? GENERIC };
}

/** Exchange a password for a session cookie. Never throws. */
export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  const creds = credentials(email, password);
  if (!creds) return { ok: false, message: MISSING };

  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signInWithPassword(creds);
  if (error) return refused(error, "signIn");

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
): Promise<AuthResult> {
  const creds = credentials(email, password);
  if (!creds) return { ok: false, message: MISSING };

  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signUp(creds);
  if (error) return refused(error, "signUp");

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
