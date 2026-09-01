/**
 * The cash-on-delivery order payload (§4.0) — types and assembly only. Nothing
 * here leaves the browser: there is no order backend, no mailer and no payment
 * provider (§1). <Checkout> logs this object when the order is placed, so the one
 * change a real destination needs is a request at that call site, with the shape
 * already settled here.
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
  /** Integer PKR — the sum of every `lineTotal`. No delivery fee or tax exists. */
  total: number;
}

/**
 * A reference the customer can quote back: `PRF-M3K9X4-7Q1B`. The timestamp in
 * base 36 keeps it short and roughly sortable; the random tail separates two
 * orders placed in the same millisecond. Call this from an event handler only —
 * generated during render, the server and the client would disagree.
 */
export function orderReference(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const tail = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0")
    .toUpperCase();
  return `PRF-${stamp}-${tail}`;
}

/** Freeze the entered details and the current cart into one order payload. */
export function buildOrder(
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
    reference: orderReference(),
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
    total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
  };
}
