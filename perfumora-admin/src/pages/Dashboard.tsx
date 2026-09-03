import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { Icon, type IconName } from "../components/Icon";
import { useOrders } from "../orders/context";
import { useFragrances } from "../fragrances/context";
import { formatPrice, formatDate, isThisMonth, itemCount } from "../lib/format";
import { LOW_STOCK_THRESHOLD, offeredSizes } from "../lib/types";

/* ---------------------------------------------------------------------------
   Dashboard overview.

   Everything here is derived from the two shared providers rather than queried
   again: the catalog gives the headline count and the low-stock list, orders
   give the pending / delivered counts and the recent feed. Both lists are
   already in memory by the time this renders, so the maths stays local.
--------------------------------------------------------------------------- */

/** How many orders the recent feed shows. */
const RECENT_LIMIT = 8;

/** How many size-level warnings the low-stock card lists. */
const LOW_STOCK_LIMIT = 5;

interface Stat {
  label: string;
  value: number;
  icon: IconName;
  tint: string;
  to: string;
  hint: string;
}

export function Dashboard() {
  const { orders, loading: ordersLoading, error: ordersError } = useOrders();
  const {
    fragrances,
    loading: catalogLoading,
    error: catalogError,
  } = useFragrances();

  const loading = ordersLoading || catalogLoading;
  const error = ordersError ?? catalogError;

  const recent = orders.slice(0, RECENT_LIMIT);
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const deliveredThisMonth = orders.filter(
    (o) => o.status === "delivered" && isThisMonth(o.createdAt),
  ).length;

  // One entry per size at or below the threshold, scarcest first. Inactive
  // fragrances are skipped — they're not on sale, so they can't run out — and
  // so are sizes a fragrance doesn't sell, which would otherwise read as a
  // permanent zero-stock alert that could never be cleared.
  const lowStock = useMemo(
    () =>
      fragrances
        .filter((f) => f.active)
        .flatMap((f) =>
          offeredSizes(f.sizes)
            .filter(({ variant }) => variant.stock <= LOW_STOCK_THRESHOLD)
            .map(({ size, variant }) => ({
              id: f.id,
              name: f.name,
              color: f.color,
              size,
              stock: variant.stock,
            })),
        )
        .sort((a, b) => a.stock - b.stock),
    [fragrances],
  );

  const stats: Stat[] = [
    {
      label: "Total fragrances",
      value: fragrances.length,
      icon: "droplet",
      tint: "bg-indigo-50 text-indigo-600",
      to: "/fragrances",
      hint: "In catalog",
    },
    {
      label: "Pending orders",
      value: pendingCount,
      icon: "clock",
      tint: "bg-amber-50 text-amber-600",
      to: "/orders?status=pending",
      hint: "Awaiting action",
    },
    {
      label: "Delivered this month",
      value: deliveredThisMonth,
      icon: "check-circle",
      tint: "bg-emerald-50 text-emerald-600",
      to: "/orders?status=delivered",
      hint: "Fulfilled",
    },
    {
      label: "Low-stock alerts",
      value: lowStock.length,
      icon: "alert",
      tint: "bg-rose-50 text-rose-600",
      to: "/fragrances?filter=low-stock",
      hint: "Need a restock",
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Dashboard" description="A quick pulse on your store." />

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tint}`}
              >
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              <Icon
                name="chevron-right"
                className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400"
              />
            </div>
            <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
              {loading ? <span className="text-slate-300">—</span> : s.value}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">{s.label}</p>
            <p className="text-xs text-slate-400">{s.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent orders */}
        <div className="xl:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Recent orders</h2>
              <Link
                to="/orders"
                className="text-sm font-medium text-accent hover:text-accent-hover"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-14">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-accent" />
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon="bag"
                title="No orders yet"
                message="New orders will appear here as they come in."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {recent.map((o) => (
                  <Link
                    key={o.id}
                    to={`/orders/${o.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {o.customerName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        #{o.id.replace("order_", "")} · {itemCount(o.items)}{" "}
                        {itemCount(o.items) === 1 ? "item" : "items"} ·{" "}
                        {formatDate(o.createdAt)}
                      </p>
                    </div>
                    <span className="hidden text-sm font-semibold text-slate-900 sm:block">
                      {formatPrice(o.total)}
                    </span>
                    <StatusBadge status={o.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low-stock alerts */}
        <div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
              <Icon name="alert" className="h-4 w-4 text-rose-500" />
              <h2 className="font-semibold text-slate-900">Low stock</h2>
            </div>

            {loading ? (
              <div className="flex justify-center py-14">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-accent" />
              </div>
            ) : lowStock.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="Everything's stocked"
                message={`No size is down to ${LOW_STOCK_THRESHOLD} or fewer.`}
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {lowStock.slice(0, LOW_STOCK_LIMIT).map((f) => (
                  <div
                    key={`${f.id}-${f.size}`}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span
                      className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/5"
                      style={{ backgroundColor: f.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {f.name}
                      </p>
                      <p className="text-xs text-slate-500">{f.size}</p>
                    </div>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                      {f.stock === 0 ? "Out" : `${f.stock} left`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Link
              to="/fragrances?filter=low-stock"
              className="block border-t border-slate-200 px-5 py-3 text-center text-sm font-medium text-accent transition-colors hover:bg-slate-50"
            >
              Manage inventory
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
