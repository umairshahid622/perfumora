import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Icon, type IconName } from "../components/Icon";
import { formatPrice, formatDate, isThisMonth, itemCount } from "../lib/format";
import type { Order } from "../lib/types";

/* ---------------------------------------------------------------------------
   Dashboard overview.

   Data is hardcoded inline (design phase). It's shaped like the Firestore
   records it'll become:
   - `recentOrders` mirrors a `where(...).orderBy('createdAt','desc').limit(8)`
     query on the orders collection — used for the recent list AND the pending/
     delivered stats.
   - Headline totals that a real app would read via an aggregate/count query
     (rather than by loading every document) are kept as plain numbers here.
--------------------------------------------------------------------------- */

const recentOrders: Order[] = [
  {
    id: "order_1043",
    customerName: "Ahmed Raza",
    customerEmail: "ahmed.raza@gmail.com",
    customerPhone: "+92 300 1234567",
    shippingAddress: "House 12, Street 4, DHA Phase 5, Lahore",
    status: "pending",
    createdAt: "2026-09-02T09:12:00Z",
    items: [
      { fragranceId: "frag_001", fragranceName: "Midnight Oud", size: "50ml", qty: 1, price: 3800 },
    ],
    total: 3800,
  },
  {
    id: "order_1042",
    customerName: "Sara Khan",
    customerEmail: "sara.khan@outlook.com",
    customerPhone: "+92 321 9876543",
    shippingAddress: "Flat 3B, Clifton Block 2, Karachi",
    status: "pending",
    createdAt: "2026-09-02T07:40:00Z",
    items: [
      { fragranceId: "frag_004", fragranceName: "Rose Taif", size: "30ml", qty: 2, price: 2900 },
      { fragranceId: "frag_009", fragranceName: "Amber Noir", size: "50ml", qty: 1, price: 4200 },
    ],
    total: 10000,
  },
  {
    id: "order_1041",
    customerName: "Bilal Ahmed",
    customerEmail: "bilal.a@gmail.com",
    customerPhone: "+92 333 4567890",
    shippingAddress: "22-C, Gulberg III, Lahore",
    status: "processing",
    createdAt: "2026-09-01T14:05:00Z",
    items: [
      { fragranceId: "frag_002", fragranceName: "White Musk", size: "50ml", qty: 1, price: 3500 },
    ],
    total: 3500,
  },
  {
    id: "order_1040",
    customerName: "Hina Tariq",
    customerEmail: "hina.tariq@gmail.com",
    customerPhone: "+92 345 1112223",
    shippingAddress: "House 88, F-10/2, Islamabad",
    status: "processing",
    createdAt: "2026-09-01T11:30:00Z",
    items: [
      { fragranceId: "frag_007", fragranceName: "Sandalwood Dusk", size: "30ml", qty: 1, price: 2600 },
      { fragranceId: "frag_012", fragranceName: "Vetiver Green", size: "30ml", qty: 1, price: 2400 },
    ],
    total: 5000,
  },
  {
    id: "order_1039",
    customerName: "Usman Malik",
    customerEmail: "usman.malik@yahoo.com",
    customerPhone: "+92 300 7778889",
    shippingAddress: "Plot 45, Bahria Town Phase 7, Rawalpindi",
    status: "delivered",
    createdAt: "2026-09-01T08:15:00Z",
    items: [
      { fragranceId: "frag_001", fragranceName: "Midnight Oud", size: "30ml", qty: 1, price: 2500 },
    ],
    total: 2500,
  },
  {
    id: "order_1038",
    customerName: "Ayesha Siddiqui",
    customerEmail: "ayesha.s@gmail.com",
    customerPhone: "+92 321 3334445",
    shippingAddress: "House 5, Model Town Block B, Lahore",
    status: "delivered",
    createdAt: "2026-08-31T16:50:00Z",
    items: [
      { fragranceId: "frag_009", fragranceName: "Amber Noir", size: "50ml", qty: 2, price: 4200 },
    ],
    total: 8400,
  },
  {
    id: "order_1037",
    customerName: "Fahad Iqbal",
    customerEmail: "fahad.iqbal@gmail.com",
    customerPhone: "+92 333 6667778",
    shippingAddress: "27-B, Askari 10, Lahore",
    status: "delivered",
    createdAt: "2026-08-30T13:20:00Z",
    items: [
      { fragranceId: "frag_005", fragranceName: "Citrus Bloom", size: "30ml", qty: 1, price: 2300 },
    ],
    total: 2300,
  },
  {
    id: "order_1036",
    customerName: "Mariam Yousaf",
    customerEmail: "mariam.y@outlook.com",
    customerPhone: "+92 345 8889990",
    shippingAddress: "House 19, PECHS Block 6, Karachi",
    status: "canceled",
    createdAt: "2026-08-29T10:00:00Z",
    items: [
      { fragranceId: "frag_004", fragranceName: "Rose Taif", size: "50ml", qty: 1, price: 4100 },
    ],
    total: 4100,
  },
];

/* Fragrances at/below the low-stock threshold — the alerts card. Mirrors a
   `where('lowStock','==',true)` style query. */
const lowStockAlerts = [
  { id: "frag_009", name: "Amber Noir", size: "50ml", stock: 1, color: "#3b2f2f" },
  { id: "frag_001", name: "Midnight Oud", size: "50ml", stock: 2, color: "#2E2A24" },
  { id: "frag_012", name: "Vetiver Green", size: "30ml", stock: 2, color: "#3f5e3a" },
  { id: "frag_004", name: "Rose Taif", size: "30ml", stock: 3, color: "#8c3b4a" },
];

// Headline count that would be an aggregate query in production.
const TOTAL_FRAGRANCES = 25;

interface Stat {
  label: string;
  value: number;
  icon: IconName;
  tint: string;
  to: string;
  hint: string;
}

export function Dashboard() {
  const pendingCount = recentOrders.filter((o) => o.status === "pending").length;
  const deliveredThisMonth = recentOrders.filter(
    (o) => o.status === "delivered" && isThisMonth(o.createdAt),
  ).length;

  const stats: Stat[] = [
    {
      label: "Total fragrances",
      value: TOTAL_FRAGRANCES,
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
      value: lowStockAlerts.length,
      icon: "alert",
      tint: "bg-rose-50 text-rose-600",
      to: "/fragrances?filter=low-stock",
      hint: "Need a restock",
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        description="A quick pulse on your store."
      />

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
              {s.value}
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
            <div className="divide-y divide-slate-100">
              {recentOrders.map((o) => (
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
                      #{o.id.replace("order_", "")} ·{" "}
                      {itemCount(o.items)}{" "}
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
          </div>
        </div>

        {/* Low-stock alerts */}
        <div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
              <Icon name="alert" className="h-4 w-4 text-rose-500" />
              <h2 className="font-semibold text-slate-900">Low stock</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {lowStockAlerts.map((f) => (
                <div key={`${f.id}-${f.size}`} className="flex items-center gap-3 px-5 py-3">
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
                    {f.stock} left
                  </span>
                </div>
              ))}
            </div>
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
