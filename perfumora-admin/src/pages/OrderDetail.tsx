import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/Button";
import { useOrders } from "../orders/context";
import { formatPrice, formatDateTime, itemCount } from "../lib/format";
import { ORDER_STATUSES, type OrderStatus } from "../lib/types";
import { cn } from "../lib/cn";

/* ---------------------------------------------------------------------------
   Order detail. Pulls the order from OrdersContext by :id; status changes made
   here update the same shared state the list reads, so both stay in sync.
--------------------------------------------------------------------------- */

// The normal fulfillment path, for the stepper. Canceled sits outside it.
const FLOW: OrderStatus[] = ["pending", "processing", "delivered"];

export function OrderDetail() {
  const { id } = useParams();
  const { getOrder, updateStatus, loading, error } = useOrders();
  const order = id ? getOrder(id) : undefined;

  // On a direct hit or a refresh the list hasn't arrived yet — wait for it
  // before deciding the order doesn't exist.
  if (loading) {
    return (
      <div className="animate-fade-in">
        <BackLink />
        <div className="mt-4 flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-accent" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="animate-fade-in">
        <BackLink />
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
          <EmptyState
            icon="bag"
            title="Order not found"
            message={error ?? "It may have been removed, or the link is wrong."}
            action={
              <Link to="/orders">
                <Button variant="secondary">Back to orders</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const canceled = order.status === "canceled";
  const currentStep = FLOW.indexOf(order.status);

  return (
    <div className="animate-fade-in">
      <BackLink />

      <PageHeader
        title={`Order #${order.id.replace("order_", "")}`}
        description={formatDateTime(order.createdAt)}
        actions={<StatusBadge status={order.status} />}
      />

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: items + status controls */}
        <div className="space-y-6 lg:col-span-2">
          {/* Line items */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">
                Items
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {itemCount(order.items)} total
                </span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items.map((item, i) => (
                <div
                  key={`${item.fragranceId}-${item.size}-${i}`}
                  className="flex items-center gap-4 px-5 py-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                    <Icon name="droplet" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {item.fragranceName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.size} · {formatPrice(item.price)} each
                    </p>
                  </div>
                  <span className="text-sm text-slate-500">×{item.qty}</span>
                  <span className="w-24 text-right font-semibold text-slate-900">
                    {formatPrice(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
              <span className="font-medium text-slate-600">Order total</span>
              <span className="text-lg font-bold text-slate-900">
                {formatPrice(order.total)}
              </span>
            </div>
          </section>

          {/* Status control */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-900">Update status</h2>

            {/* Stepper (hidden once canceled) */}
            {!canceled && (
              <div className="mb-5 flex items-center">
                {FLOW.map((step, i) => {
                  const done = i <= currentStep;
                  return (
                    <div key={step} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center gap-1.5">
                        <span
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                            done
                              ? "bg-accent text-white"
                              : "bg-slate-100 text-slate-400",
                          )}
                        >
                          {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium capitalize",
                            done ? "text-slate-900" : "text-slate-400",
                          )}
                        >
                          {step}
                        </span>
                      </div>
                      {i < FLOW.length - 1 && (
                        <div
                          className={cn(
                            "mx-2 h-0.5 flex-1 rounded transition-colors",
                            i < currentStep ? "bg-accent" : "bg-slate-100",
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Status buttons */}
            <div className="flex flex-wrap gap-2">
              {ORDER_STATUSES.map((s) => {
                const active = order.status === s;
                const isCancel = s === "canceled";
                return (
                  <button
                    key={s}
                    onClick={() => void updateStatus(order.id, s)}
                    disabled={active}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors disabled:cursor-default",
                      active
                        ? isCancel
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-accent bg-accent text-white"
                        : isCancel
                          ? "border-slate-200 text-rose-600 hover:bg-rose-50"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {active && <Icon name="check" className="mr-1 inline h-3.5 w-3.5" />}
                    {s}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right: customer + shipping */}
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-900">Customer</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Name
                </dt>
                <dd className="font-medium text-slate-900">
                  {order.customerName}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Email
                </dt>
                <dd>
                  <a
                    href={`mailto:${order.customerEmail}`}
                    className="text-accent hover:text-accent-hover"
                  >
                    {order.customerEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Phone
                </dt>
                <dd className="text-slate-900">{order.customerPhone}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Icon name="truck" className="h-4 w-4 text-slate-400" />
              Shipping
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              {order.shippingAddress}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/orders"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
    >
      <Icon name="arrow-left" className="h-4 w-4" />
      All orders
    </Link>
  );
}
