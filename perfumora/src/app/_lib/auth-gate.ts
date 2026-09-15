/* ---------------------------------------------------------------------------
   Asking the header to open its sign-in card, and waiting for the answer.

   The card has exactly one owner: <Navigation>, which holds the `panel` state
   that opens it and the `customer` state it reports back to. <Checkout> is a
   sibling island on the `/checkout` route, not a child of the header, so it has
   no prop to reach through — and the two are not even in the same subtree, since
   the header is mounted once in the root layout and outlives every route.

   A window event rather than a context provider, which is the same choice
   `useBottleUncap` makes to reach <Ritual>: the two ends of this live in
   different trees, and the alternative is a provider wrapped around the whole
   document to carry one function.

   The event carries its own answer channel. `dispatchEvent` is synchronous, so
   the listener has set `handled` before the dispatch returns, and a request that
   nobody was listening for resolves immediately instead of leaving its caller
   waiting on a card that is never going to open.
--------------------------------------------------------------------------- */

export const AUTH_REQUEST_EVENT = "perfumora:auth-request";

/** What the request carries. `handled` is written by the listener, read by the
 *  sender the instant `dispatchEvent` returns. */
export interface AuthRequestDetail {
  resolve: (signedIn: boolean) => void;
  handled: boolean;
}

/**
 * Open the sign-in card, and resolve once the customer is either signed in
 * (`true`) or has dismissed it (`false`).
 *
 * `false` is not a failure and callers must not treat it as one — it is the
 * ordinary outcome for a guest who would rather not have an account, which
 * `/checkout` has to keep supporting. It also covers the header not being
 * mounted at all, where there is nothing to show.
 */
export function requestSignIn(): Promise<boolean> {
  return new Promise((resolve) => {
    const detail: AuthRequestDetail = { resolve, handled: false };
    window.dispatchEvent(
      new CustomEvent<AuthRequestDetail>(AUTH_REQUEST_EVENT, { detail }),
    );
    if (!detail.handled) resolve(false);
  });
}
