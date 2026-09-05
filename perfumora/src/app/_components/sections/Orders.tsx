"use client";

import type { AccountOrder, OrderStatus } from "../../_lib/account";
import { formatPrice } from "../../_lib/variants";
import { useRouteTransition } from "../providers/RouteTransition";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { RippleButton } from "../ui/RippleButton";

/**
 * The micro-cap label over each block — the same plain string <Checkout> keeps,
 * and for the same reason: tailwind-merge files `text-micro` in one group with
 * `text-<colour>`, so a `cn()` holding both silently drops one of the two.
 */
const LABEL = "text-micro text-muted-on-light font-medium uppercase";

/**
 * The three stages an order moves through. `canceled` is deliberately absent: it
 * is not a later stage of this flow but a departure from it — how the admin panel
 * models it too — and <StatusRail> spells out anything this list does not hold.
 */
const FLOW: readonly OrderStatus[] = ["pending", "processing", "delivered"];

/**
 * Placed-at, in the timezone the shop delivers in. Pinned rather than left to the
 * runtime: this island server-renders and then hydrates, so a Node process on UTC
 * would disagree with the browser about which day an evening order was placed —
 * a hydration mismatch, and the wrong date for the customer. `en-GB` gives the
 * day-month-year the admin panel already shows these same rows in.
 */
function formatPlaced(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
}

/**
 * How far the order has got, borrowing the step counter from <Checkout>'s own
 * heading column: the stage it sits at in the accent, the stages behind it in ink,
 * the ones ahead muted. The same vocabulary because it says the same kind of
 * thing — where in a sequence you are — and the customer met that rail on the way
 * to placing this order.
 *
 * A status outside {@link FLOW} is spoken as itself instead. That covers
 * `canceled`, and it covers a stage added to the enum after this was written:
 * either way a rail with nothing lit would name no status at all, which is worse
 * than a bare word.
 */
function StatusRail({ status }: { status: OrderStatus }) {
  const reached = FLOW.indexOf(status);

  if (reached === -1) {
    return (
      <span className="text-micro text-accent-on-light font-medium uppercase">
        {status}
      </span>
    );
  }

  return (
    <ol
      aria-label="Order status"
      className="text-micro flex flex-wrap items-center gap-y-2 font-medium uppercase"
    >
      {FLOW.map((stage, i) => (
        <li
          key={stage}
          aria-current={i === reached ? "step" : undefined}
          className={
            i === reached
              ? "text-accent-on-light"
              : i < reached
                ? "text-ink"
                : "text-muted-on-light"
          }
        >
          {stage}
          {i < FLOW.length - 1 && (
            <span aria-hidden="true" className="text-muted-on-light mx-3">
              ·
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * One placed order. A bordered surface rather than the hairline rules the rest of
 * this page uses, because an order is a group with its own internal rules — the
 * total is ruled off inside it — and two levels of the same rule would flatten
 * that. The radius and hairline are <AccountMenu>'s panel treatment.
 *
 * The reference wears the display type it was announced in on the confirmation
 * step, so the string the customer wrote down looks like the string they are
 * reading back. No swatch beside each line, unlike the cart: `order_items` stores
 * the name and the price it sold at, never the juice colour, and joining the live
 * catalogue back on would colour a discontinued bottle by whatever replaced it.
 */
function OrderCard({ order }: { order: AccountOrder }) {
  return (
    <li className="border-hairline-on-light rounded-2xl border p-6 md:p-8">
      {/* `items-baseline` sits the date on the eyebrow's line rather than the
          reference's, so the two labels read as one row above the number. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div>
          <span className={LABEL}>Order</span>
          <p className="font-display mt-2 text-2xl leading-none uppercase md:text-3xl">
            {order.reference}
          </p>
        </div>
        <span className={LABEL}>{formatPlaced(order.placedAt)}</span>
      </div>

      <div className="mt-6">
        <span className={LABEL}>Status</span>
        <div className="mt-2">
          <StatusRail status={order.status} />
        </div>
      </div>

      <ul className="mt-8 flex flex-col gap-5">
        {order.lines.map((line) => (
          <li key={line.id} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-medium">{line.name}</p>
              <p className="text-micro text-muted-on-light font-medium uppercase">
                {line.size} · Qty {line.quantity}
              </p>
            </div>
            <span className="text-base font-medium">
              {formatPrice(line.unitPrice * line.quantity)}
            </span>
          </li>
        ))}
      </ul>

      {/* The stored total, not the sum of the lines above: the two differ only if a
          bottle was repriced between the bag and the write, and this is the figure
          the courier collected. */}
      <div className="border-hairline-on-light mt-6 flex items-baseline justify-between border-t pt-6">
        <span className={LABEL}>Total</span>
        <span className="text-price text-accent-on-light font-display">
          {formatPrice(order.total)}
        </span>
      </div>
    </li>
  );
}

/**
 * The account's order history. The orders arrive as props: the read is RLS-scoped
 * and needs the request's cookies, so `/orders/page.tsx` does it and this island
 * only renders — which is also why the list can be trusted as already the
 * customer's own.
 *
 * A client component for one reason, as <Gallery> is: the empty state's CTA leaves
 * the page, and leaving a page here means the GSAP curtain in
 * {@link useRouteTransition}, not an <a>. Everything else on the page is static.
 *
 * Never an empty prop for a signed-out visitor: the route redirects them home before
 * this renders, so `orders` is always this customer's own list and an empty one means
 * they have not ordered yet — the one thing this page must not say wrongly.
 *
 * Two columns with a sticky heading, from <Checkout>: this page arrives from the
 * same account panel, and the narrow column keeps a receipt's line length honest
 * inside the layout's `max-w-[110rem]`.
 */
export function Orders({ orders }: { orders: AccountOrder[] }) {
  const { navigate } = useRouteTransition();

  return (
    <Container>
      <div className="grid gap-12 md:grid-cols-2 md:gap-20">
        <div className="lg:sticky lg:top-[calc(4.75rem+2rem)] lg:self-start">
          <Eyebrow>Your account</Eyebrow>
          <RevealHeading className="text-section mt-4 max-w-[14ch] text-balance">
            Your orders
          </RevealHeading>
          {/* Placeholder copy — not brand-approved final wording. */}
          <p className="text-body text-muted-on-light mt-6 max-w-sm">
            Every order you have placed with us, newest first. Quote its
            reference if you need to ask the atelier about one.
          </p>
        </div>

        <div>
          {orders.length === 0 ? (
            <div className="flex flex-col items-start gap-8">
              <p className="text-body text-muted-on-light">
                You have not placed an order yet.
              </p>
              <RippleButton
                onClick={() => navigate("/collection")}
                aria-label="Explore the collection"
              >
                Explore the collection
              </RippleButton>
            </div>
          ) : (
            <ul className="flex flex-col gap-6">
              {orders.map((order) => (
                <OrderCard key={order.reference} order={order} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Container>
  );
}
