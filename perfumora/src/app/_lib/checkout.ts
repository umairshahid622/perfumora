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
 * What a COD delivery needs from the customer. Phone rather than email: the
 * courier calls, and nothing here can send mail. Placeholder schema — not a
 * brand-approved checkout.
 */
export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  city: string;
  /** The one field a customer may leave blank. */
  notes: string;
}

export const EMPTY_DETAILS: CustomerDetails = {
  name: "",
  phone: "",
  address: "",
  city: "",
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
      notes: details.notes.trim(),
    },
    lines,
    total: placed.total,
  };
}
