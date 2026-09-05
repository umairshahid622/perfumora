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
 *
 * From `lg` up the flow is centred in what is left of the viewport and told to be at
 * least that tall, so the details step reads as one screen rather than as something
 * to scroll. `min-h` and not `h`: a step that genuinely doesn't fit — a bag with a
 * dozen lines — grows the page and scrolls, instead of being centred into a box it
 * overflows at the top as well as the bottom, where the first line would be
 * unreachable. `dvh` for the same reason <MegaMenu> uses it. The gutter drops to
 * `py-8` there because on a tall window the centring is what supplies the air, and on
 * a short one that padding is the difference between fitting and not.
 */
export default function CheckoutPage() {
  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-16 md:py-20 lg:flex lg:min-h-[calc(100dvh-4.75rem)] lg:items-center lg:py-8">
        <Checkout />
      </div>
    </main>
  );
}
