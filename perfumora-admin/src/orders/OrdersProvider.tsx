import { useMemo, useState, type ReactNode } from "react";
import type { Order } from "../lib/types";
import { OrdersContext, type OrdersContextValue } from "./context";

/* ---------------------------------------------------------------------------
   Orders provider.

   The brief asks to keep data inline with no external state library. The list
   and the detail screen are separate routes, yet a status change on one must
   show on the other — so the seed lives here in a small React Context (a
   built-in, not a state-management dependency) that both routes read from.

   Data is shaped like Firestore order docs (see lib/types → Order). Swapping
   this provider's internals for an onSnapshot subscription + updateDoc call is
   the only change needed when the backend lands; consumers stay identical.
--------------------------------------------------------------------------- */

const SEED: Order[] = [
  {
    id: "order_1043", customerName: "Ahmed Raza", customerEmail: "ahmed.raza@gmail.com",
    customerPhone: "+92 300 1234567", shippingAddress: "House 12, Street 4, DHA Phase 5, Lahore",
    status: "pending", createdAt: "2026-09-02T09:12:00Z",
    items: [{ fragranceId: "frag_001", fragranceName: "Midnight Oud", size: "50ml", qty: 1, price: 3800 }],
    total: 3800,
  },
  {
    id: "order_1042", customerName: "Sara Khan", customerEmail: "sara.khan@outlook.com",
    customerPhone: "+92 321 9876543", shippingAddress: "Flat 3B, Clifton Block 2, Karachi",
    status: "pending", createdAt: "2026-09-02T07:40:00Z",
    items: [
      { fragranceId: "frag_004", fragranceName: "Rose Taif", size: "30ml", qty: 2, price: 2900 },
      { fragranceId: "frag_009", fragranceName: "Amber Noir", size: "50ml", qty: 1, price: 4200 },
    ],
    total: 10000,
  },
  {
    id: "order_1041", customerName: "Bilal Ahmed", customerEmail: "bilal.a@gmail.com",
    customerPhone: "+92 333 4567890", shippingAddress: "22-C, Gulberg III, Lahore",
    status: "processing", createdAt: "2026-09-01T14:05:00Z",
    items: [{ fragranceId: "frag_002", fragranceName: "White Musk", size: "50ml", qty: 1, price: 3500 }],
    total: 3500,
  },
  {
    id: "order_1040", customerName: "Hina Tariq", customerEmail: "hina.tariq@gmail.com",
    customerPhone: "+92 345 1112223", shippingAddress: "House 88, F-10/2, Islamabad",
    status: "processing", createdAt: "2026-09-01T11:30:00Z",
    items: [
      { fragranceId: "frag_007", fragranceName: "Sandalwood Dusk", size: "30ml", qty: 1, price: 2600 },
      { fragranceId: "frag_012", fragranceName: "Vetiver Green", size: "30ml", qty: 1, price: 2400 },
    ],
    total: 5000,
  },
  {
    id: "order_1039", customerName: "Usman Malik", customerEmail: "usman.malik@yahoo.com",
    customerPhone: "+92 300 7778889", shippingAddress: "Plot 45, Bahria Town Phase 7, Rawalpindi",
    status: "delivered", createdAt: "2026-09-01T08:15:00Z",
    items: [{ fragranceId: "frag_001", fragranceName: "Midnight Oud", size: "30ml", qty: 1, price: 2500 }],
    total: 2500,
  },
  {
    id: "order_1038", customerName: "Ayesha Siddiqui", customerEmail: "ayesha.s@gmail.com",
    customerPhone: "+92 321 3334445", shippingAddress: "House 5, Model Town Block B, Lahore",
    status: "delivered", createdAt: "2026-08-31T16:50:00Z",
    items: [{ fragranceId: "frag_009", fragranceName: "Amber Noir", size: "50ml", qty: 2, price: 4200 }],
    total: 8400,
  },
  {
    id: "order_1037", customerName: "Fahad Iqbal", customerEmail: "fahad.iqbal@gmail.com",
    customerPhone: "+92 333 6667778", shippingAddress: "27-B, Askari 10, Lahore",
    status: "delivered", createdAt: "2026-08-30T13:20:00Z",
    items: [{ fragranceId: "frag_005", fragranceName: "Citrus Bloom", size: "30ml", qty: 1, price: 2300 }],
    total: 2300,
  },
  {
    id: "order_1036", customerName: "Mariam Yousaf", customerEmail: "mariam.y@outlook.com",
    customerPhone: "+92 345 8889990", shippingAddress: "House 19, PECHS Block 6, Karachi",
    status: "canceled", createdAt: "2026-08-29T10:00:00Z",
    items: [{ fragranceId: "frag_004", fragranceName: "Rose Taif", size: "50ml", qty: 1, price: 4100 }],
    total: 4100,
  },
  {
    id: "order_1035", customerName: "Zain Abbas", customerEmail: "zain.abbas@gmail.com",
    customerPhone: "+92 300 2223334", shippingAddress: "House 61, Wapda Town, Lahore",
    status: "delivered", createdAt: "2026-08-28T15:10:00Z",
    items: [
      { fragranceId: "frag_014", fragranceName: "Jasmine Veil", size: "50ml", qty: 1, price: 3800 },
      { fragranceId: "frag_018", fragranceName: "Sea Salt & Sage", size: "30ml", qty: 1, price: 2500 },
    ],
    total: 6300,
  },
  {
    id: "order_1034", customerName: "Nida Aslam", customerEmail: "nida.aslam@outlook.com",
    customerPhone: "+92 321 5556667", shippingAddress: "Flat 7, Gulshan-e-Iqbal Block 5, Karachi",
    status: "delivered", createdAt: "2026-08-27T12:00:00Z",
    items: [{ fragranceId: "frag_021", fragranceName: "Fig & Cedar", size: "50ml", qty: 1, price: 3900 }],
    total: 3900,
  },
];

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(SEED);

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      getOrder: (id) => orders.find((o) => o.id === id),
      updateStatus: (id, status) =>
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status } : o)),
        ),
    }),
    [orders],
  );

  return <OrdersContext value={value}>{children}</OrdersContext>;
}
