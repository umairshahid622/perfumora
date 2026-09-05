"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { currentCustomer } from "../../_lib/auth";
import { useCart, type CartLine } from "../../_lib/cart-context";
import {
  EMPTY_DETAILS,
  buildOrder,
  type CustomerDetails,
  type Order,
} from "../../_lib/checkout";
import { prefersReducedMotion } from "../../_lib/motion";
import { placeOrder } from "../../_lib/orders";
import { formatPrice } from "../../_lib/variants";
import { useRouteTransition } from "../providers/RouteTransition";
import { AppInput } from "../ui/AppInput";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { RippleButton } from "../ui/RippleButton";

const STEPS = ["Cart", "Details", "Review", "Done"] as const;

/**
 * The micro-cap label used across the review recap and the money rows. Kept as a
 * plain string, never routed through `cn()`: tailwind-merge files the type-scale
 * tokens (`text-micro`, `text-body`, `text-price`) in the same group as
 * `text-<colour>`, so a `cn()` holding both silently drops one of the two. The
 * form fields themselves are now <AppInput>, which owns its own chrome.
 */
const LABEL = "text-micro text-muted-on-light font-medium uppercase";

/**
 * The keys of <CustomerDetails> that hold text — every one but `billingSame`.
 * Derived rather than listed, so a field added to the interface later cannot quietly
 * get a non-string past `setField`.
 */
type TextField = {
  [K in keyof CustomerDetails]: CustomerDetails[K] extends string ? K : never;
}[keyof CustomerDetails];

/** The bag, listed the way the cart drawer lists it. `onRemove` is omitted on the
 *  review step, where the list is a recap rather than an editable bag. */
function OrderLines({
  items,
  onRemove,
}: {
  items: readonly CartLine[];
  onRemove?: (key: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-6">
      {items.map((line) => (
        <li key={line.key} className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="border-hairline-on-light mt-1 size-10 shrink-0 rounded-full border"
            // Juice colour is variant data, not a design token.
            style={{ backgroundColor: line.hex }}
          />
          <div className="flex-1">
            <p className="text-base font-medium">{line.name}</p>
            <p className="text-micro text-muted-on-light font-medium uppercase">
              {line.size}ml · Qty {line.quantity}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-base font-medium">
              {formatPrice(line.price * line.quantity)}
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(line.key)}
                className="text-micro text-muted-on-light hover:text-accent-on-light font-medium uppercase transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The money row, matching the cart drawer's footer. */
function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={LABEL}>{label}</span>
      <span className="text-price text-accent-on-light font-display">
        {formatPrice(value)}
      </span>
    </div>
  );
}

/** The quiet counterpart to <RippleButton> for backwards moves, borrowing the
 *  drawer's "Remove" text-button treatment. */
function StepBack({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-micro text-muted-on-light hover:text-accent-on-light font-medium uppercase transition-colors"
    >
      {children}
    </button>
  );
}

/** The check mark for the box below. Local, the way <AppInput> keeps its own eye
 *  glyph, rather than added to `navigation/icons` — that file is the header's set. */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d="m5 13 5 5L19 7" />
    </svg>
  );
}

/**
 * The flow's one checkbox. A real `<input type="checkbox">` kept in the accessibility
 * tree by `sr-only` rather than swapped out for a styled div — so the space bar, the
 * label's own click target and a screen reader's "checked" all come for free — with
 * the visible box drawn by its sibling so the mark can wear the accent.
 * `peer-focus-visible` puts the ring on that sibling, since the input it belongs to is
 * the invisible one. `py-3` rather than tighter: with the 20px box that is a 44px
 * target, which is the floor for something a thumb has to hit.
 *
 * Deliberately not an <AppInput> variant: that component's floating label, drawn
 * border and reveal toggle are all built around a field holding a string, and a
 * boolean has none of that chrome to inherit.
 */
function CheckField({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="border-hairline-on-light text-accent-on-light peer-checked:border-accent-on-light peer-focus-visible:ring-accent-on-light/40 grid size-5 shrink-0 place-items-center rounded-md border transition-colors peer-focus-visible:ring-2"
      >
        {checked && <CheckIcon />}
      </span>
      <span className="text-micro text-muted-on-light font-medium uppercase">
        {children}
      </span>
    </label>
  );
}

/**
 * Checkout (§4.0) — the whole cash-on-delivery flow as four steps: the bag,
 * delivery details, a review, and a confirmation. It's the one client island on
 * the `/checkout` route; the cart drawer's button closes itself and routes here,
 * so the bag is step 0 rather than a screen the customer passes through twice.
 *
 * Placing an order writes it to Supabase through the `placeOrder` Server Action,
 * which decrements the stock in the same transaction and hands back the stored
 * reference and the total the database computed. Only that success advances to
 * the confirmation and empties the bag; a refusal — a bottle that sold out while
 * it sat in the cart — is shown inline with the bag intact, so the customer can
 * drop the line and try again. Still cash on delivery only: online payment joins
 * the review step's single "Cash on Delivery" row when it exists.
 *
 * The steps themselves are not persisted, so a reload starts the flow over. The
 * placed order is not lost by that — it is a row in the database — but the
 * reference is only ever shown once (§1).
 *
 * The step change is the flow's one animation: the panel slides in from the
 * side travelled toward, so stepping forward and stepping back read differently.
 */
export function Checkout() {
  const { items, subtotal, removeItem, clear } = useCart();
  const { navigate } = useRouteTransition();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [details, setDetails] = useState<CustomerDetails>(EMPTY_DETAILS);
  /** The signed-in customer's name, or `""` for a guest. Held separately from
   *  `details` so that "start a new order" can seed the form again without asking
   *  the server a second time. */
  const [accountName, setAccountName] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  /** The server's refusal, shown on the review step. Cleared on every attempt so
   *  a stale "sold out" can't outlive the line that caused it. */
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // Direction is recorded by whoever moves the step, never derived from the index
  // delta — the same reason <ScentProvider> takes a `towards`. "Back to details"
  // and "start a new order" both travel backwards, and only the caller knows it.
  const go = (to: number, towards: number) => {
    setDirection(towards);
    setStep(to);
  };

  useGSAP(
    () => {
      // Every step starts at the top of the flow. The page is a single scroll
      // context, so the position reached part-way down a long details step would
      // otherwise carry straight into the review and open it half read. Above the
      // reduced-motion return, because it isn't motion.
      window.scrollTo({ top: 0 });

      // Skipped outright rather than run at `duration: 0`: a `fromTo` that never
      // plays would leave the from-values applied with nothing to clear them.
      if (prefersReducedMotion()) return;

      // The panel already holds the new step; slide it in from the side we
      // travelled toward. `xPercent` so the offset scales with the column, and
      // `overwrite` so stepping again mid-flight replaces the tween instead of
      // fighting it.
      gsap.fromTo(
        panelRef.current,
        { xPercent: direction >= 0 ? 6 : -6, autoAlpha: 0 },
        {
          xPercent: 0,
          autoAlpha: 1,
          duration: 0.5,
          ease: "power3.out",
          overwrite: true,
        },
      );
    },
    { dependencies: [step], revertOnUpdate: false },
  );

  // The one delivery field the account already knows, filled in so a signed-in
  // customer doesn't retype what they gave us at sign-up. Asked for here rather
  // than handed down: <Navigation> holds the same answer, but it is a sibling of
  // this island rather than an ancestor, and a context carrying one string would
  // be more plumbing than the string is worth.
  //
  // `.then` rather than `await` in the effect body, matching <Navigation>: a
  // synchronous setState inside an effect is the cascading render that
  // `set-state-in-effect` is about, and resolving a promise later is not. The
  // `live` flag drops the answer if the route was left before it arrived.
  useEffect(() => {
    let live = true;
    currentCustomer().then((customer) => {
      if (!live || !customer) return;
      setAccountName(customer.name);
      // Never over something already typed. A signed-in shopper may well be
      // sending a bottle to someone else, and the name they entered has to
      // survive both this answer arriving late and every later re-render.
      setDetails((current) =>
        current.name ? current : { ...current, name: customer.name },
      );
    });
    return () => {
      live = false;
    };
  }, []);

  const setField = (field: TextField) => (value: string) =>
    setDetails((current) => ({ ...current, [field]: value }));

  // Unticking is what reveals the billing fields. Whatever was typed into them is left
  // alone on re-tick rather than wiped: the server ignores those three while this flag
  // is true — it copies the shipping address over them — and the review step reads the
  // flag too, so nothing stale can be shown or stored. Ticking twice by accident
  // therefore costs nothing.
  const setBillingSame = (same: boolean) =>
    setDetails((current) => ({ ...current, billingSame: same }));

  const submitDetails = (event: FormEvent<HTMLFormElement>) => {
    // The advance needs no validation of its own: every required field is native,
    // so the browser has already refused to submit while one is empty.
    event.preventDefault();
    go(2, 1);
  };

  const place = () => {
    // Both of these are already reflected in the button's `disabled`, so this is
    // the second lock rather than the first — a double submit would write a second
    // order, which is not a race worth leaving to the DOM alone.
    if (!items.length || pending) return;
    setFailure(null);

    // Captured before the await: `clear()` below empties the cart, and the
    // confirmation is built from the bag as it was reviewed.
    const reviewed = items;

    startTransition(async () => {
      const result = await placeOrder(
        details,
        // What was ordered, never what it costs — the database prices the order
        // itself, so a forged request cannot name its own total (orders.ts).
        reviewed.map((line) => ({
          variantId: line.variantId,
          size: line.size,
          qty: line.quantity,
        })),
      );

      // Failure leaves the bag and the step exactly as they were: the fix for
      // "that one sold out" is to remove it here and press the button again.
      if (!result.ok) {
        setFailure(result.message);
        return;
      }

      // Held as a snapshot because `clear()` empties the cart: the confirmation
      // below reads this, never `items`/`subtotal`.
      setOrder(buildOrder(result, details, reviewed));
      clear();
      go(3, 1);
    });
  };

  const restart = () => {
    // Back to blank except for the name, which the account still knows — the same
    // state a signed-in customer's first visit to the details step starts from.
    setDetails({ ...EMPTY_DETAILS, name: accountName });
    setOrder(null);
    setFailure(null);
    go(0, -1);
  };

  return (
    <Container>
      <div className="grid gap-12 md:grid-cols-2 md:gap-20">
        {/* Sticks under the header from `lg` up, so the heading and the step counter
            stay in view while a long details step scrolls past them. `self-start` is
            the load-bearing half: a grid item stretches to its row by default, and an
            item exactly as tall as the row it sits in has nowhere to travel, so
            `sticky` would resolve to no movement at all. The offset clears the fixed
            header's `h-[4.75rem]` with a gap rather than tucking under it, and is
            written as the sum so the header's height stays legible. */}
        <div className="lg:sticky lg:top-[calc(4.75rem+2rem)] lg:self-start">
          <Eyebrow>Checkout</Eyebrow>
          <RevealHeading className="text-section mt-4 max-w-[14ch] text-balance">
            Complete your order
          </RevealHeading>
          {/* Placeholder copy — not brand-approved final wording. */}
          <p className="text-body text-muted-on-light mt-6 max-w-sm">
            Cash on delivery, anywhere in Pakistan — settle with the courier
            when your parfum arrives.
          </p>

          {/* Static position indicator: the animation pass covers the step
              transition, not this row. The size sits on the <ol> so each <li>
              carries only a colour — `cn()` would drop one of the two. */}
          <ol className="text-micro mt-10 flex flex-wrap items-center gap-y-2 font-medium uppercase">
            {STEPS.map((label, i) => (
              <li
                key={label}
                aria-current={i === step ? "step" : undefined}
                className={
                  i === step
                    ? "text-accent-on-light"
                    : i < step
                      ? "text-ink"
                      : "text-muted-on-light"
                }
              >
                {String(i + 1).padStart(2, "0")} {label}
                {i < STEPS.length - 1 && (
                  <span aria-hidden="true" className="text-muted-on-light mx-3">
                    ·
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* A floor under the panel so the short steps don't drag the centred
            layout up and down as the flow advances. */}
        <div ref={panelRef} className="min-h-[22rem]">
          {step === 0 &&
            (items.length === 0 ? (
              <div className="flex flex-col items-start gap-8">
                <p className="text-body text-muted-on-light">
                  Your cart is empty.
                </p>
                <RippleButton
                  onClick={() => navigate("/")}
                  aria-label="Explore the collection"
                >
                  Explore the collection
                </RippleButton>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                <OrderLines items={items} onRemove={removeItem} />
                <div className="border-hairline-on-light border-t pt-6">
                  <TotalRow label="Subtotal" value={subtotal} />
                </div>
                <RippleButton
                  onClick={() => go(1, 1)}
                  className="self-start"
                  aria-label="Continue to delivery details"
                >
                  Continue to details
                </RippleButton>
              </div>
            ))}

          {step === 1 && (
            <form onSubmit={submitDetails} className="flex flex-col gap-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <AppInput
                  label="Full name"
                  required
                  autoComplete="name"
                  value={details.name}
                  onChange={setField("name")}
                  placeholder="Your name"
                />
                <AppInput
                  label="Phone"
                  variant="tel"
                  required
                  autoComplete="tel"
                  value={details.phone}
                  onChange={setField("phone")}
                  placeholder="3xx xxx xxxx"
                />
              </div>
              <AppInput
                label="Address"
                variant="textarea"
                required
                rows={3}
                autoComplete="street-address"
                value={details.address}
                onChange={setField("address")}
                placeholder="House, street, area"
              />
              {/* Paired the way name/phone are: the postal code belongs beside the
                  city it narrows, and both are short. Not required — a five-digit
                  code is something most people here would have to go and look up,
                  while the courier is routing on the city and the landmark anyway. */}
              <div className="grid gap-6 sm:grid-cols-2">
                <AppInput
                  label="City"
                  required
                  autoComplete="address-level2"
                  value={details.city}
                  onChange={setField("city")}
                  placeholder="Lahore"
                />
                <AppInput
                  label="Postal code"
                  optional
                  autoComplete="postal-code"
                  value={details.postalCode}
                  onChange={setField("postalCode")}
                  placeholder="54000"
                />
              </div>
              <AppInput
                label="Delivery notes"
                variant="textarea"
                optional
                rows={2}
                value={details.notes}
                onChange={setField("notes")}
                placeholder="Landmark or preferred time"
              />

              {/* Billing, ruled off from everything above it: it is the one part of
                  this form that isn't about where the parcel goes. Nothing consumes it
                  yet — cash on delivery has no card issuer to check an address
                  against — so the box ships ticked and an ordinary order costs no
                  extra typing. Unticking is what makes the fields appear, and only
                  then are they `required`, so the browser asks for them as a set.
                  Full width rather than paired, unlike the row above: "Billing postal
                  code" and its Optional tag both want the space.
                  No animation on the reveal, matching this flow's rule that the step
                  change is its one piece of motion. */}
              <div className="border-hairline-on-light border-t pt-6">
                <span className={LABEL}>Billing</span>
                <CheckField
                  checked={details.billingSame}
                  onChange={setBillingSame}
                >
                  Same as shipping address
                </CheckField>
                {!details.billingSame && (
                  <div className="mt-4 flex flex-col gap-6">
                    <AppInput
                      label="Billing address"
                      variant="textarea"
                      required
                      rows={3}
                      autoComplete="billing street-address"
                      value={details.billingAddress}
                      onChange={setField("billingAddress")}
                      placeholder="House, street, area"
                    />
                    <AppInput
                      label="Billing city"
                      required
                      autoComplete="billing address-level2"
                      value={details.billingCity}
                      onChange={setField("billingCity")}
                      placeholder="Lahore"
                    />
                    <AppInput
                      label="Billing postal code"
                      optional
                      autoComplete="billing postal-code"
                      value={details.billingPostalCode}
                      onChange={setField("billingPostalCode")}
                      placeholder="54000"
                    />
                  </div>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-6">
                <RippleButton type="submit" aria-label="Continue to review">
                  Continue to review
                </RippleButton>
                <StepBack onClick={() => go(0, -1)}>Back to cart</StepBack>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-8">
              <div>
                <span className={LABEL}>Deliver to</span>
                <div className="text-body mt-2 flex flex-col">
                  <span>{details.name}</span>
                  <span>{details.phone}</span>
                  <span className="text-muted-on-light">
                    {details.address}
                  </span>
                  {/* One line whether or not a postal code was given, so a blank one
                      doesn't leave an empty row in the recap. */}
                  <span className="text-muted-on-light">
                    {[details.city, details.postalCode]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                  {details.notes && (
                    <span className="text-muted-on-light mt-2">
                      {details.notes}
                    </span>
                  )}
                </div>
              </div>

              {/* Only when it differs. A "same as shipping" line here would say
                  nothing the block above hasn't already said — and the ticked box is
                  the ordinary case, so it would say it on nearly every order. */}
              {!details.billingSame && (
                <div>
                  <span className={LABEL}>Bill to</span>
                  <div className="text-body text-muted-on-light mt-2 flex flex-col">
                    <span>{details.billingAddress}</span>
                    <span>
                      {[details.billingCity, details.billingPostalCode]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  </div>
                </div>
              )}

              <OrderLines items={items} />

              <div className="border-hairline-on-light flex flex-col gap-6 border-t pt-6">
                <TotalRow label="Total" value={subtotal} />
                <div>
                  <span className={LABEL}>Payment</span>
                  {/* The single method today; online payment joins this row. */}
                  <p className="text-body mt-1">Cash on Delivery</p>
                  <p className="text-body text-muted-on-light">
                    Pay the courier when your order arrives.
                  </p>
                </div>
              </div>

              {/* The server's refusal, in the accent the page already uses for
                  attention — a border and a sentence rather than a colour alone,
                  since the reason is the actionable part. `role="alert"` so it is
                  announced: the button that caused it keeps focus. */}
              {failure && (
                <p
                  role="alert"
                  className="border-accent-on-light text-body text-accent-on-light border-l-2 pl-4"
                >
                  {failure}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-6">
                <RippleButton
                  onClick={place}
                  disabled={pending}
                  // Dropped while pending so the accessible name is the visible
                  // "Placing order…" rather than contradicting it.
                  aria-label={pending ? undefined : "Place order"}
                >
                  {pending ? "Placing order…" : "Place order"}
                </RippleButton>
                <StepBack onClick={() => go(1, -1)}>Back to details</StepBack>
              </div>
            </div>
          )}

          {step === 3 && order && (
            <div className="flex flex-col items-start gap-8">
              <div>
                <span className={LABEL}>Order reference</span>
                <p className="font-display mt-2 text-3xl leading-none uppercase md:text-4xl">
                  {order.reference}
                </p>
              </div>

              <div className="border-hairline-on-light w-full border-t pt-6">
                <TotalRow label="Due on delivery" value={order.total} />
              </div>

              <p className="text-body text-muted-on-light max-w-sm">
                {/* The reference and the total above are the database's own —
                    quoting either back identifies the stored order. */}
                Thank you — the atelier will call to confirm your delivery. Keep
                this reference for any questions about your order.
              </p>

              <StepBack onClick={restart}>Start a new order</StepBack>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
