import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuth } from "../../_lib/supabase-auth";

/* ---------------------------------------------------------------------------
   The other half of sign-up — turning the emailed link into a session.

   `signUp` in `_lib/auth.ts` takes the address, and with "Confirm email" on
   GoTrue withholds the session until the link in that email is clicked. Until
   this route existed, clicking it confirmed the account and nothing else: the
   customer landed back on the shop still signed out, because the only things
   that may write a session cookie are a Server Action and a Route Handler, and
   the link arrived at a page.

   `verifyOtp` on a `token_hash`, rather than `exchangeCodeForSession` on a
   `code`, which is the other shape this could take. A PKCE `code` can only be
   redeemed by the browser that began the sign-up, because the verifier that
   matches it is a cookie sitting in that browser — and an email link is opened
   by whatever the mail app hands it to, very often a different browser and
   frequently a different device. A `token_hash` carries everything the exchange
   needs on its own, so the link works wherever it is opened.

   That choice lives half in the dashboard: the "Confirm signup" template has to
   point here rather than at GoTrue's own `/verify`, i.e.

     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email

   Nothing else needs configuring — the link comes straight to us, so there is no
   `emailRedirectTo` to derive from a request and no entry to add to the redirect
   allow-list.
--------------------------------------------------------------------------- */

/** The two spellings GoTrue gives a confirmation token; both mean "this address
 *  is real". Anything else — a recovery or an email-change token — is not
 *  something the storefront sends, so it is refused here rather than forwarded to
 *  the auth server to judge. */
const CONFIRMS = ["signup", "email"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token_hash = params.get("token_hash");
  const type = params.get("type") ?? "";

  // Built against the request rather than an environment variable, so the same
  // handler works on localhost and on the deployed origin without either being
  // named anywhere. `NextResponse.redirect` will only take an absolute URL.
  const back = (to: string) =>
    NextResponse.redirect(new URL(to, request.nextUrl.origin));

  if (!token_hash || !CONFIRMS.includes(type)) return back("/?confirm=invalid");

  // `supabaseAuth()` rather than a client of its own: it is already the
  // cookie-backed client every other session write goes through, and its `setAll`
  // reaches a writable cookie store here — a Route Handler may set cookies, which
  // is the one thing this route exists to do.
  const supabase = await supabaseAuth();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  // A link that has expired, or one already spent. Not logged: GoTrue does not
  // distinguish the two, and both are a stale email in someone's inbox rather
  // than a fault of ours.
  if (error) return back("/?confirm=expired");

  // Signed in — the session cookies ride out on this redirect, and <Navigation>
  // asks `currentCustomer()` on mount, so the account button is already wearing
  // the customer's initial by the time the shop paints.
  return back("/");
}
