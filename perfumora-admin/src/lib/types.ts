/* ---------------------------------------------------------------------------
   Domain types — shaped to match how records will live in Firestore, so the
   hardcoded design-phase data drops in with minimal rework once the backend
   is wired up. These are type declarations only (no data, no runtime code).
--------------------------------------------------------------------------- */

/** The two sizes we sell. No sample size. */
export type SizeKey = "30ml" | "50ml";

export const SIZE_KEYS: readonly SizeKey[] = ["30ml", "50ml"];

/** Price (whole PKR rupees) + stock for a single size of a fragrance. */
export interface SizeVariant {
  price: number;
  stock: number;
}

export interface Fragrance {
  id: string;
  name: string;
  /** Storage URL in production; may be a blob: preview in the design phase. */
  imageUrl: string;
  /** Hex used as the fragrance's UI accent (card border / swatch). */
  color: string;
  description: string;
  /** Hidden from the storefront when false, without deleting the record. */
  active: boolean;
  sizes: Record<SizeKey, SizeVariant>;
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
