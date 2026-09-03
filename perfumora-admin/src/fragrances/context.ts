import { createContext, useContext } from "react";
import type { Fragrance } from "../lib/types";

/* Context object + consumer hook for the catalog, in a non-component module so
   the provider file exports only its component (satisfies Fast Refresh). */

export interface FragrancesContextValue {
  fragrances: Fragrance[];
  /** True during the first load only. */
  loading: boolean;
  /** Last read or write failure, ready to show. Null when everything's fine. */
  error: string | null;
  refresh: () => Promise<void>;
  /* Mutations resolve false (and set `error`) instead of rejecting. */
  /** Creates or replaces a fragrance, sizes included. */
  save: (fragrance: Fragrance) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  setActive: (id: string, active: boolean) => Promise<boolean>;
}

export const FragrancesContext = createContext<FragrancesContextValue | null>(null);

export function useFragrances(): FragrancesContextValue {
  const ctx = useContext(FragrancesContext);
  if (!ctx) {
    throw new Error("useFragrances must be used within <FragrancesProvider>");
  }
  return ctx;
}
