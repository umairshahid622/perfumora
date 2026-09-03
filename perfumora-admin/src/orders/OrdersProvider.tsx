import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Order } from "../lib/types";
import { fetchOrders, updateOrderStatus } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { OrdersContext, type OrdersContextValue } from "./context";

/* ---------------------------------------------------------------------------
   Orders provider.

   The list and the detail screen are separate routes, yet a status change on
   one must show on the other — so orders are fetched once here into a small
   React Context (a built-in, not a state-management dependency) that both
   routes read from.

   Mounted inside ProtectedRoute, so there's always a session by the time the
   first query runs and RLS lets it through.
--------------------------------------------------------------------------- */

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetchOrders().then(
        (rows) => {
          setOrders(rows);
          setError(null);
          setLoading(false);
        },
        (err: unknown) => {
          setError(errorMessage(err, "Could not load orders."));
          setLoading(false);
        },
      ),
    [],
  );

  // First load. Note the state changes all happen in the promise callbacks
  // above, never synchronously inside the effect.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      loading,
      error,
      refresh,
      getOrder: (id) => orders.find((o) => o.id === id),

      updateStatus: async (id, status) => {
        // Move the badge now; the write is a single column and rarely fails.
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
        try {
          await updateOrderStatus(id, status);
          setError(null);
          return true;
        } catch (err) {
          setError(errorMessage(err, "Could not update the order."));
          await refresh(); // Put the server's version back on screen.
          return false;
        }
      },
    }),
    [orders, loading, error, refresh],
  );

  return <OrdersContext value={value}>{children}</OrdersContext>;
}
