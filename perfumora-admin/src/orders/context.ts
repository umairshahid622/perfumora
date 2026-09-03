import { createContext, useContext } from "react";
import type { Order, OrderStatus } from "../lib/types";

/* Context object + consumer hook for orders, in a non-component module so the
   provider file exports only its component (satisfies Fast Refresh). */

export interface OrdersContextValue {
  orders: Order[];
  /** True during the first load only; a manual refresh doesn't blank the page. */
  loading: boolean;
  /** Last read or write failure, ready to show. Null when everything's fine. */
  error: string | null;
  getOrder: (id: string) => Order | undefined;
  /** Re-reads from Postgres. */
  refresh: () => Promise<void>;
  /** Resolves false (and sets `error`) instead of rejecting, so call sites in
      event handlers don't need a try/catch. */
  updateStatus: (id: string, status: OrderStatus) => Promise<boolean>;
}

export const OrdersContext = createContext<OrdersContextValue | null>(null);

export function useOrders(): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within <OrdersProvider>");
  return ctx;
}
