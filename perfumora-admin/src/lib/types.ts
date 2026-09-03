/* ---------------------------------------------------------------------------
   Domain types — the camelCase shape the UI works in. lib/api.ts maps these to
   and from the snake_case Postgres tables in supabase/schema.sql, so nothing
   below has to mirror the database layout.
--------------------------------------------------------------------------- */

/** The two sizes we sell. No sample size. */
export type SizeKey = "30ml" | "50ml";

export const SIZE_KEYS: readonly SizeKey[] = ["30ml", "50ml"];

/** Price (whole PKR rupees) + stock for a single size of a fragrance. */
export interface SizeVariant {
  price: number;
  stock: number;
}

/**
 * Which sizes a fragrance sells, and at what price.
 *
 * Deliberately partial: a key is present only if we actually sell that size.
 * Some fragrances come in 30ml only, some in 50ml only, most in both. An
 * absent key means "not sold" — which is NOT the same as being present with
 * `stock: 0`, meaning "sold, but we've run out". Keeping them distinct is why
 * this is `Partial` rather than a full record: the storefront must hide a size
 * it never sells, while showing a sold-out one as unavailable.
 */
export type SizeMap = Partial<Record<SizeKey, SizeVariant>>;

/**
 * The sizes a fragrance actually sells, always smallest first.
 *
 * Use this instead of iterating SIZE_KEYS and indexing, so absent sizes are
 * skipped rather than read as zeroes — and so the variant comes back narrowed
 * to non-undefined.
 */
export function offeredSizes(sizes: SizeMap): { size: SizeKey; variant: SizeVariant }[] {
  return SIZE_KEYS.flatMap((size) => {
    const variant = sizes[size];
    return variant ? [{ size, variant }] : [];
  });
}

export interface Fragrance {
  id: string;
  name: string;
  /** Storage URL, or "" when no image has been uploaded yet. */
  imageUrl: string;
  /** Hex used as the fragrance's UI accent (card border / swatch). */
  color: string;
  description: string;
  /** Hidden from the storefront when false, without deleting the record. */
  active: boolean;
  /** At least one size — a fragrance with none is unbuyable. See SizeMap. */
  sizes: SizeMap;
}

export type OrderStatus = "pending" | "processing" | "delivered" | "canceled";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "processing",
  "delivered",
  "canceled",
];

/** One line of an order: a specific fragrance + size + quantity. */
export interface OrderItem {
  fragranceId: string;
  fragranceName: string;
  size: SizeKey;
  qty: number;
  /** Unit price captured at order time. */
  price: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  status: OrderStatus;
  /** ISO 8601 timestamp. */
  createdAt: string;
  items: OrderItem[];
  total: number;
}

/** Stock at or below this (per size) counts as a low-stock alert. */
export const LOW_STOCK_THRESHOLD = 3;
