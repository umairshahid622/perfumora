import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { TextField } from "../components/Field";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { useOrders } from "../orders/context";
import { formatPrice, formatDate, itemCount } from "../lib/format";
import { ORDER_STATUSES, type OrderStatus, type Order } from "../lib/types";
import { cn } from "../lib/cn";

/* ---------------------------------------------------------------------------
   Orders list. Reads shared order state from OrdersContext. Filter + search
   state lives in the URL so links (e.g. from the dashboard) deep-link into a
   scoped view and the browser back button behaves.
--------------------------------------------------------------------------- */

const STATUS_TABS: { key: OrderStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  ...ORDER_STATUSES.map((s) => ({
    key: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
  })),
];

/** Flatten orders to CSV and trigger a download. Client-side only. */
function exportCsv(orders: Order[]) {
  const header = [
    "Order ID", "Customer", "Email", "Phone", "Status",
    "Created", "Items", "Total (Rs)", "Shipping address", "City", "Delivery notes",
  ];
  const rows = orders.map((o) => [
    o.id,
    o.customerName,
    o.customerEmail,
    o.customerPhone,
    o.status,
    o.createdAt,
    o.items.map((i) => `${i.fragranceName} ${i.size} x${i.qty}`).join("; "),
    String(o.total),
    o.shippingAddress,
    o.city,
    o.notes,
  ]);
  // Quote every field and escape embedded quotes.
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "perfumora-orders.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function Orders() {
  const { orders, loading, error, refresh } = useOrders();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = (searchParams.get("status") as OrderStatus | "all") || "all";
  const query = searchParams.get("q") ?? "";

  // Merge one param at a time, dropping empties to keep URLs tidy.
  const patchParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (q) {
        const haystack = `${o.customerName} ${o.id} ${o.customerEmail}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, status, query]);

  // Per-status counts for the tab badges.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const s of ORDER_STATUSES) c[s] = orders.filter((o) => o.status === s).length;
    return c;
  }, [orders]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Orders"
        description={loading ? "Loading…" : `${orders.length} total`}
        actions={
          <Button
            variant="secondary"
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
          >
            <Icon name="download" className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => void refresh()}
            className="font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Status tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => patchParams({ status: t.key === "all" ? "" : t.key })}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              status === t.key
                ? "border-accent text-accent"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                status === t.key
                  ? "bg-accent/10 text-accent"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 sm:max-w-xs">
        <TextField
          aria-label="Search orders"
          placeholder="Search customer or order #…"
          leading={<Icon name="search" className="h-4 w-4" />}
          value={query}
          onChange={(e) => patchParams({ q: e.target.value })}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-accent" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="bag"
            title={orders.length === 0 ? "No orders yet" : "No orders match"}
            message={
              orders.length === 0
                ? "New orders will appear here as they come in."
                : "Try a different status or search term."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="hidden px-5 py-3 md:table-cell">Date</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Items</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="group transition-colors hover:bg-slate-50"
                  >
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      #{o.id.replace("order_", "")}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">
                        {o.customerName}
                      </p>
                      <p className="text-xs text-slate-500">{o.customerEmail}</p>
                    </td>
                    <td className="hidden px-5 py-3.5 text-slate-600 md:table-cell">
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="hidden px-5 py-3.5 text-slate-600 sm:table-cell">
                      {itemCount(o.items)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                      {formatPrice(o.total)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/orders/${o.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-accent opacity-0 transition-opacity hover:text-accent-hover group-hover:opacity-100"
                      >
                        View
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
