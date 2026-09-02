import { createContext, useContext } from "react";
import type { Order, OrderStatus } from "../lib/types";

/* Context object + consumer hook for orders, in a non-component module so the
   provider file exports only its component (satisfies Fast Refresh). */

export interface OrdersContextValue {
  orders: Order[];
  getOrder: (id: string) => Order | undefined;
  updateStatus: (id: string, status: OrderStatus) => void;
}

export const OrdersContext = createContext<OrdersContextValue | null>(null);

export function useOrders(): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within <OrdersProvider>");
  return ctx;
}
