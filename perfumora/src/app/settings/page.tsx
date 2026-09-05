import { redirect } from "next/navigation";
import { Settings } from "../_components/sections/Settings";
import { currentCustomer } from "../_lib/auth";

/**
 * Never cached, and never shared between two people — the same reasoning as
 * `/orders`. `cookies()` inside `supabaseAuth()` already forces dynamic rendering,
 * so strictly this line changes nothing; it is here because the root layout carries
 * `revalidate = 300`, the lowest `revalidate` on a route governs the whole of it,
 * and a reader asking whether one customer's name could be served to the next
 * visitor should find the answer in this file.
 */
export const revalidate = 0;

/**
 * The `/settings` route — the signed-in customer's own account details, reached from
 * the account panel's "Settings". Chrome is the shared <Navigation> from the root
 * layout, and `pt-[4.75rem]` matches that header's `h-[4.75rem]`, as on `/orders`.
 *
 * `py-10 md:py-12` rather than `/orders`' `py-16 md:py-20`: an order history is a
 * scroll however much room it is given, while this page is two short forms that
 * should sit inside one screen on a laptop, and the section's own spacing is tuned
 * to the same end.
 *
 * `currentCustomer()` here rather than in the island: it validates the session
 * against the auth server, and the cookie it needs exists only on the server.
 * <Settings> is a client component for its two forms, so the account reaches it as a
 * prop — the same split `/orders` makes with its rows.
 *
 * Signed out, nobody gets this far: `currentCustomer()` is already the session check
 * — `getUser()` validated against the auth server — so the guard is the answer it
 * gives rather than a second question. Same shape and same destination as `/orders`,
 * whose jsdoc carries the reasoning for putting it in the route rather than in
 * `src/proxy.ts`; both pages are reached from the same dropdown and a visitor who
 * loses their session on one should not meet different behaviour on the other.
 */
export default async function SettingsPage() {
  const customer = await currentCustomer();
  if (!customer) redirect("/");

  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-10 md:py-12">
        <Settings customer={customer} />
      </div>
    </main>
  );
}
