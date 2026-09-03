import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Fragrance } from "../lib/types";
import {
  deleteFragrance,
  fetchFragrances,
  setFragranceActive,
  upsertFragrance,
} from "../lib/api";
import { errorMessage } from "../lib/errors";
import { FragrancesContext, type FragrancesContextValue } from "./context";

/* ---------------------------------------------------------------------------
   Catalog provider.

   Both the inventory screen and the dashboard's totals / low-stock card read
   the same list, so it's fetched once here rather than twice. Same shape as
   OrdersProvider — see the note there.
--------------------------------------------------------------------------- */

export function FragrancesProvider({ children }: { children: ReactNode }) {
  const [fragrances, setFragrances] = useState<Fragrance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetchFragrances().then(
        (rows) => {
          setFragrances(rows);
          setError(null);
          setLoading(false);
        },
        (err: unknown) => {
          setError(errorMessage(err, "Could not load fragrances."));
          setLoading(false);
        },
      ),
    [],
  );

  // First load. State only changes inside the promise callbacks above.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<FragrancesContextValue>(
    () => ({
      fragrances,
      loading,
      error,
      refresh,

      // Re-read afterwards: a new fragrance has to land in name order, and
      // this is the one write that touches two tables.
      save: async (fragrance) => {
        try {
          await upsertFragrance(fragrance);
          await refresh();
          return true;
        } catch (err) {
          setError(errorMessage(err, "Could not save the fragrance."));
          return false;
        }
      },

      remove: async (id) => {
        const removed = fragrances.find((f) => f.id === id);
        setFragrances((prev) => prev.filter((f) => f.id !== id));
        try {
          await deleteFragrance(id);
          setError(null);
          return true;
        } catch (err) {
          setError(
            errorMessage(err, `Could not delete ${removed?.name ?? "the fragrance"}.`),
          );
          await refresh(); // Put it back.
          return false;
        }
      },

      setActive: async (id, active) => {
        setFragrances((prev) => prev.map((f) => (f.id === id ? { ...f, active } : f)));
        try {
          await setFragranceActive(id, active);
          setError(null);
          return true;
        } catch (err) {
          setError(errorMessage(err, "Could not update availability."));
          await refresh();
          return false;
        }
      },
    }),
    [fragrances, loading, error, refresh],
  );

  return <FragrancesContext value={value}>{children}</FragrancesContext>;
}
