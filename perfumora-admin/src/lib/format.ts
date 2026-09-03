/* Formatting helpers — pure utilities, safe to share across pages. */

/** `2500` → `Rs 2,500`. Prices are whole PKR rupees. */
export function formatPrice(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK")}`;
}

/** ISO → `30 Aug 2026`. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** ISO → `30 Aug 2026, 3:00 PM`. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** True when `iso` falls in the current calendar month (used for stats). */
export function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Total item count across an order's lines. */
export function itemCount(items: { qty: number }[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}
