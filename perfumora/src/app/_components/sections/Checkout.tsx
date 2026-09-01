"use client";

import { useRef, useState, type FormEvent } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useCart, type CartLine } from "../../_lib/cart-context";
import {
  EMPTY_DETAILS,
  buildOrder,
  type CustomerDetails,
  type Order,
} from "../../_lib/checkout";
import { prefersReducedMotion } from "../../_lib/motion";
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

/**
 * Checkout (§4.0) — the whole cash-on-delivery flow as four steps: the bag,
 * delivery details, a review, and a confirmation. It's the one client island on
 * the `/checkout` route; the cart drawer's button closes itself and routes here,
 * so the bag is step 0 rather than a screen the customer passes through twice.
 *
 * UI ONLY. Placing an order logs the assembled payload and shows a locally
 * generated reference — no request, no mail, no payment provider, and no
 * persistence, so a reload starts over (§1). Online payment joins the review
 * step's single "Cash on Delivery" row when it exists.
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
  const [order, setOrder] = useState<Order | null>(null);
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

  const setField = (field: keyof CustomerDetails) => (value: string) =>
    setDetails((current) => ({ ...current, [field]: value }));

  const submitDetails = (event: FormEvent<HTMLFormElement>) => {
    // The advance needs no validation of its own: every required field is native,
    // so the browser has already refused to submit while one is empty.
    event.preventDefault();
    go(2, 1);
  };

  const place = () => {
    if (!items.length) return; // <RippleButton> has no `disabled`; guard here
    const placed = buildOrder(details, items);
    // The whole order in one object — send it from here once a backend exists (§1).
    console.log("Perfumora order (COD)", placed);
    // Held as a snapshot because `clear()` empties the cart: the confirmation
    // below reads this, never `items`/`subtotal`.
    setOrder(placed);
    clear();
    go(3, 1);
  };

  const restart = () => {
    setDetails(EMPTY_DETAILS);
    setOrder(null);
    go(0, -1);
  };

  return (
    <Container>
      <div className="grid gap-12 md:grid-cols-2 md:gap-20">
        <div>
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
              <AppInput
                label="City"
                required
                autoComplete="address-level2"
                value={details.city}
                onChange={setField("city")}
                placeholder="Lahore"
              />
              <AppInput
                label="Delivery notes"
                variant="textarea"
                optional
                rows={2}
                value={details.notes}
                onChange={setField("notes")}
                placeholder="Landmark or preferred time"
              />
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
                  <span className="text-muted-on-light">{details.city}</span>
                  {details.notes && (
                    <span className="text-muted-on-light mt-2">
                      {details.notes}
                    </span>
                  )}
                </div>
              </div>

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

              <div className="flex flex-wrap items-center gap-6">
                <RippleButton onClick={place} aria-label="Place order">
                  Place order
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
                {/* Static confirmation: the reference is generated in the
                    browser and nothing was transmitted (§1). */}
                Thank you — the atelier will call to confirm your delivery.
              </p>

              <StepBack onClick={restart}>Start a new order</StepBack>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
