/**
 * The cash-on-delivery order payload (§4.0) — types and assembly only.
 *
 * This is the *confirmation screen's* view of an order. The record itself is a
 * row in Supabase, written by `placeOrder` (./orders.ts); `buildOrder` below
 * freezes the reviewed bag around the reference and total that write returned, so
 * what the customer reads back is provably the order that landed. Still no
 * mailer and no payment provider (§1).
 */

import type { CartLine } from "./cart-context";
import type { SizeMl, VariantId } from "./variants";

/**
 * What a COD delivery needs from the customer, plus what a card payment will.
 * Phone rather than email: the courier calls, and nothing here can send mail.
 *
 * Four fields are required — name, phone, address, city. The postal code is not:
 * Pakistan's five-digit codes are widely unknown by the people who live at the
 * address, and a courier routes on the city and the landmark regardless, so making
 * it mandatory would only buy an abandoned bag. The billing address is optional in
 * the practical sense — it sits behind a "same as shipping" checkbox that ships
 * checked, so the ordinary path adds no typing — and nothing consumes it yet, since
 * cash on delivery has no card issuer performing an address check. It is collected
 * for the gateway that will.
 *
 * Placeholder schema — not a brand-approved checkout.
 */
export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  /** Whether the billing address *is* the shipping one. Stored rather than worked
   *  out later by comparing the two: once either is edited, or a stray space creeps
   *  into one, a comparison stops being able to answer what the customer said. */
  billingSame: boolean;
  /** Only ever typed when `billingSame` is false. `placeOrder` copies the shipping
   *  address over these when it is true, so the stored order always has a billing
   *  address and no reader needs a fallback rule. */
  billingAddress: string;
  billingCity: string;
  billingPostalCode: string;
  notes: string;
}

export const EMPTY_DETAILS: CustomerDetails = {
  name: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  // Checked by default, which is the whole reason the billing address costs the
  // ordinary customer nothing.
  billingSame: true,
  billingAddress: "",
  billingCity: "",
  billingPostalCode: "",
  notes: "",
};

/**
 * One ordered SKU, flattened out of its cart line with the price maths resolved.
 * The juice colour is deliberately absent — the swatch is a UI concern, not part
 * of the order.
 */
export interface OrderLine {
  variantId: VariantId;
  name: string;
  size: SizeMl;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  reference: string;
  /** ISO 8601, taken the moment the order is placed. */
  placedAt: string;
  /** Cash on delivery is the only method today; online payment joins this union. */
  paymentMethod: "cod";
  /** `formatPrice` is en-PK / Rs. only, so the payload states the currency
   *  outright rather than leaving a bare integer to be guessed at. */
  currency: "PKR";
  customer: CustomerDetails;
  lines: OrderLine[];
  /** Integer PKR, as the database computed it — not necessarily the sum of
   *  `lines`. The two differ only if a price changed while the bottle sat in the
   *  bag, and this is the figure the courier will collect. */
  total: number;
}

/**
 * A reference the customer can quote back: `PRF-M3K9X4-7Q1B`. The timestamp in
 * base 36 keeps it short and roughly sortable; the random tail separates two
 * orders placed in the same millisecond.
 *
 * Called on the server, inside `placeOrder`, and nowhere else: this is the order
 * row's primary key, so it is not the client's to choose.
 */
export function orderReference(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const tail = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0")
    .toUpperCase();
  return `PRF-${stamp}-${tail}`;
}

/**
 * Freeze the entered details and the current cart around what the write returned.
 *
 * `placed` is the server's half — the stored reference and the total it computed —
 * which is why they are passed in rather than derived here. Everything else is the
 * bag as the customer reviewed it.
 */
export function buildOrder(
  placed: { reference: string; total: number },
  details: CustomerDetails,
  items: readonly CartLine[],
): Order {
  const lines: OrderLine[] = items.map((line) => ({
    variantId: line.variantId,
    name: line.name,
    size: line.size,
    unitPrice: line.price,
    quantity: line.quantity,
    lineTotal: line.price * line.quantity,
  }));

  return {
    reference: placed.reference,
    placedAt: new Date().toISOString(),
    paymentMethod: "cod",
    currency: "PKR",
    customer: {
      name: details.name.trim(),
      phone: details.phone.trim(),
      address: details.address.trim(),
      city: details.city.trim(),
      postalCode: details.postalCode.trim(),
      billingSame: details.billingSame,
      billingAddress: details.billingAddress.trim(),
      billingCity: details.billingCity.trim(),
      billingPostalCode: details.billingPostalCode.trim(),
      notes: details.notes.trim(),
    },
    lines,
    total: placed.total,
  };
}
