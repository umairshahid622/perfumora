import { redirect } from "next/navigation";
import { Orders } from "../_components/sections/Orders";
import { getMyOrders } from "../_lib/account";

/**
 * Never cached, and never shared between two people. `cookies()` inside
 * `supabaseAuth()` already opts this route into dynamic rendering, so strictly
 * this line changes nothing — it is here because the root layout carries
 * `revalidate = 300`, the lowest `revalidate` on a route governs the whole of it,
 * and a reader checking whether one customer's order history could be served to
 * the next visitor should find the answer in this file rather than by reasoning
 * about which of our helpers happens to touch the request.
 */
export const revalidate = 0;

/**
 * The `/orders` route — the signed-in customer's own order history, reached from
 * the account panel's "Your orders". Chrome is the shared <Navigation> from the
 * root layout, and `pt-[4.75rem]` matches that header's `h-[4.75rem]`, as on
 * `/collection` and `/checkout`.
 *
 * The read happens here, not in the island: it is scoped by RLS to whoever the
 * request's cookies say is asking, and those cookies exist only on the server.
 * <Orders> is a client component for its curtain CTA alone, so the rows reach it
 * as props.
 *
 * Signed out, the page is never rendered: `getMyOrders()` answers `null` when the
 * request carries no session, and the visitor is sent home instead. That `null` is
 * `getUser()`'s verdict from the auth server rather than a guess about the cookie,
 * so the guard costs no round trip of its own.
 *
 * The check is here, in the route, and not in `src/proxy.ts`. Next's own
 * authentication guide puts the real boundary as close to the data as possible and
 * treats a check in the proxy as optimistic only
 * (node_modules/next/dist/docs/01-app/02-guides/authentication.md), and this
 * project's proxy gates nothing on purpose so that editing its matcher can never
 * quietly un-guard something. RLS is still the boundary underneath both: this
 * redirect decides what is *shown*, while `customer read own orders` decides what
 * can be *read*.
 *
 * Home rather than a `/login` route, because there is no such route — signing in is
 * a panel inside <Navigation>, and the account button that opens it is in the header
 * of wherever the visitor lands. `redirect()` in a Server Component replaces the
 * history entry rather than pushing one, so Back does not walk them into the guard a
 * second time.
 */
export default async function OrdersPage() {
  const orders = await getMyOrders();
  if (orders === null) redirect("/");

  return (
    <main className="bg-bg-light text-ink min-h-screen pt-[4.75rem]">
      <div className="py-16 md:py-20">
        <Orders orders={orders} />
      </div>
    </main>
  );
}
