import { Checkout } from "../_components/sections/Checkout";

/**
 * The `/checkout` route (§4.0) — the cash-on-delivery flow as its own page,
 * reached from the cart drawer rather than by scrolling. Its chrome is the shared
 * <Navigation> mounted in the root layout, the same header instance every route
 * wears; the cart it reads is the same instance too, because the providers live in
 * that layout and layouts survive a client navigation.
 *
 * Stays a Server Component — <Checkout> is its only client island. The
 * `pt-[4.75rem]` matches the fixed header's `h-[4.75rem]`, so the flow starts
 * below the nav instead of under it.
 */
export default function CheckoutPage() {
  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-16 md:py-20">
        <Checkout />
      </div>
    </main>
  );
}
