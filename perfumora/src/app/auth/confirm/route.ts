import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuth } from "../../_lib/supabase-auth";

/* ---------------------------------------------------------------------------
   The far end of every link we email — turning the token in it into a session.

   `signUp` in `_lib/auth.ts` takes the address, and with "Confirm email" on
   GoTrue withholds the session until the link in that email is clicked. Until
   this route existed, clicking it confirmed the account and nothing else: the
   customer landed back on the shop still signed out, because the only things
   that may write a session cookie are a Server Action and a Route Handler, and
   the link arrived at a page.

   `sendPasswordReset` leans on the same mechanism for a different end. The session
   this route writes from a `recovery` token is what `/reset-password` is allowed to
   exist behind, and the only thing `resetPassword` will accept in place of a password
   it knows the customer has forgotten.

   `verifyOtp` on a `token_hash`, rather than `exchangeCodeForSession` on a
   `code`, which is the other shape this could take. A PKCE `code` can only be
   redeemed by the browser that began the sign-up, because the verifier that
   matches it is a cookie sitting in that browser — and an email link is opened
   by whatever the mail app hands it to, very often a different browser and
   frequently a different device. A `token_hash` carries everything the exchange
   needs on its own, so the link works wherever it is opened.

   That choice lives half in the dashboard: both templates that send a customer here
   have to point at this route rather than at GoTrue's own `/verify`, i.e.

     "Confirm signup"  → {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
     "Reset Password"  → {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery

   Nothing else needs configuring — the link comes straight to us, so there is no
   `emailRedirectTo` to derive from a request and no entry to add to the redirect
   allow-list. Until an edit is made the matching flow is inert: the email arrives and
   the account is confirmed or the token spent, but the session lands in a URL fragment,
   which is the one part of a request a server never sees.
--------------------------------------------------------------------------- */

/** Where each kind of link finishes, once its token has been spent. The two spellings
 *  of a confirmation both mean "this address is real", so they end at the shop with the
 *  customer signed in; `recovery` has one thing left to do, and the session it creates
 *  is the only proof `resetPassword` will accept that it may be done. Anything else — an
 *  email-change token — is not something the storefront sends, so an unknown `type` is
 *  refused here rather than forwarded to the auth server to judge. */
const LANDS: Record<string, string> = {
  signup: "/",
  email: "/",
  recovery: "/reset-password",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token_hash = params.get("token_hash");
  const type = params.get("type") ?? "";

  // Built against the request rather than an environment variable, so the same
  // handler works on localhost and on the deployed origin without either being
  // named anywhere. `NextResponse.redirect` will only take an absolute URL.
  const back = (to: string) =>
    NextResponse.redirect(new URL(to, request.nextUrl.origin));

  const landing = LANDS[type];
  if (!token_hash || !landing) return back("/?confirm=invalid");

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
  return back(landing);
}
