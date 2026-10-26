import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Checkout } from "../_components/sections/Checkout";
import { CART_COUNT_COOKIE } from "../_lib/cart-context";

export const revalidate = 0;

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
 * Guard: if the shopper has an empty cart recorded in their cookie, navigation
 * to `/checkout` is refused and redirected to `/` immediately so the user cannot
 * land on or view the checkout page by updating the URL manually.
 */
export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const cartCount = cookieStore.get(CART_COUNT_COOKIE)?.value;

  if (cartCount === "0") {
    redirect("/");
  }

  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-16 md:py-20 lg:flex lg:min-h-[calc(100dvh-4.75rem)] lg:items-center lg:py-8">
        <Checkout />
      </div>
    </main>
  );
}
