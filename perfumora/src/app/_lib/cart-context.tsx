"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SizeMl, VariantId } from "./variants";
import { useToast } from "./toast-context";

/**
 * Cart state (§5): a plain array of line items plus add/remove/clear, held in a
 * small Context at the page root so both the Hero's Add-to-Cart and the nav's
 * cart drawer read and write the same list. No order backend beyond `place_order`,
 * no payment integration (§1, §2.11).
 *
 * The list survives a reload, because the alternative is what it replaced: the
 * provider is mounted in the root layout, so it lives through any client navigation
 * — but a refresh on `/checkout`, or opening that URL in a new tab, remounted it and
 * the bag was gone. It is kept in `localStorage`, read through
 * `useSyncExternalStore`; see the store below for why that hook and not an effect.
 */
export interface CartLine {
  /** Stable key per fragrance+size combination; quantity accumulates onto it. */
  key: string;
  variantId: VariantId;
  name: string;
  hex: string;
  size: SizeMl;
  /** Unit price at the time it was added (placeholder pricing). */
  price: number;
  quantity: number;
  /** Maximum available inventory stock for this variant + size. */
  maxStock?: number;
}

export interface AddToCartInput {
  variantId: VariantId;
  name: string;
  hex: string;
  size: SizeMl;
  price: number;
  maxStock?: number;
}

export const CART_OPEN_EVENT = "perfumora:cart-open";
export const CART_CLOSE_EVENT = "perfumora:cart-close";

export function requestCartOpen(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT));
  }
}

export function requestCartClose(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_CLOSE_EVENT));
  }
}

interface CartContextValue {
  items: CartLine[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addItem: (input: AddToCartInput, openDrawer?: boolean) => void;
  updateQuantity: (key: string, delta: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/* ---------------------------------------------------------------------------
   The store. At module scope rather than inside the provider, because that is what
   makes it external to React: `useSyncExternalStore` can then read it during the
   first client render, where an effect would only get to run afterwards — and a
   setState in that effect is both a second render and the lint error `useMediaQuery`
   already carries. Evaluated once per tab; there is one provider, in the root layout.
--------------------------------------------------------------------------- */

/** Bumped if `CartLine` ever changes shape, so an old bag is dropped whole rather
 *  than half-read into a new build. */
const STORAGE_KEY = "perfumora.cart.v1";

/** One shared empty array: snapshots are compared by identity, so handing back a
 *  fresh `[]` on every read would re-render for ever. */
const EMPTY: CartLine[] = [];

/** Storage is user-writable and may hold a bag from an older build, so a line is
 *  trusted only as far as the UI reads it — `line.price.toLocaleString()` on a string
 *  is a blank page. Not a money check: `place_order` looks every price up itself, so
 *  a forged line cannot name its own. */
function isLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.key === "string" &&
    typeof line.variantId === "string" &&
    typeof line.name === "string" &&
    typeof line.hex === "string" &&
    (line.size === 30 || line.size === 50) &&
    typeof line.price === "number" &&
    typeof line.quantity === "number" &&
    line.quantity > 0 &&
    (line.maxStock === undefined || typeof line.maxStock === "number")
  );
}

function read(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.every(isLine) ? parsed : EMPTY;
  } catch {
    // Storage refused (private mode, blocked site data) or JSON that isn't: an
    // unreadable bag is an empty one, never a throw on first paint.
    return EMPTY;
  }
}

// `typeof window` is the SSR pass of this client module, where there is no storage.
let lines: CartLine[] = typeof window === "undefined" ? EMPTY : read();
const listeners = new Set<() => void>();

function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Full, or refused: the in-memory bag is still correct, it just won't survive the
    // next reload. Dropping the click as well would be the worse of the two.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return lines;
}

/** The server has no bag, so hydration renders the empty one already in the HTML and
 *  React swaps the stored bag in on the commit straight after. That is the whole
 *  reason a persisted cart here isn't a hydration mismatch. */
function getServerSnapshot() {
  return EMPTY;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isOpen, setIsOpen] = useState(false);
  const { showToast } = useToast();

  const openCart = useCallback(() => {
    setIsOpen(true);
    requestCartOpen();
  }, []);

  const closeCart = useCallback(() => {
    setIsOpen(false);
    requestCartClose();
  }, []);

  const toggleCart = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) requestCartOpen();
      else requestCartClose();
      return next;
    });
  }, []);

  const addItem = useCallback(
    (input: AddToCartInput, openDrawer = false) => {
      const key = `${input.variantId}-${input.size}`;
      // Read through `getSnapshot()`, not the `items` above: these handlers are memoised
      // with no dependencies, so a closed-over array would be whatever the bag held when
      // the provider first mounted — nothing.
      const current = getSnapshot();
      const existing = current.find((line) => line.key === key);
      const max = input.maxStock ?? existing?.maxStock;

      if (existing) {
        if (max !== undefined && existing.quantity >= max) {
          showToast(
            `Only ${max} bottle${max === 1 ? "" : "s"} of ${input.name} (${input.size}ml) available in stock.`,
          );
          return;
        }
        const nextQuantity = existing.quantity + 1;
        commit(
          current.map((line) =>
            line.key === key
              ? { ...line, quantity: nextQuantity, maxStock: max ?? line.maxStock }
              : line,
          ),
        );
      } else {
        if (max !== undefined && max <= 0) {
          showToast(`${input.name} (${input.size}ml) is currently sold out.`);
          return;
        }
        commit([
          ...current,
          {
            ...input,
            key,
            quantity: 1,
          },
        ]);
      }

      if (openDrawer) {
        setIsOpen(true);
        requestCartOpen();
      }
    },
    [showToast],
  );

  const updateQuantity = useCallback(
    (key: string, delta: number) => {
      const current = getSnapshot();
      const existing = current.find((line) => line.key === key);
      if (!existing) return;

      if (
        delta > 0 &&
        existing.maxStock !== undefined &&
        existing.quantity >= existing.maxStock
      ) {
        showToast(
          `Only ${existing.maxStock} bottle${existing.maxStock === 1 ? "" : "s"} of ${existing.name} (${existing.size}ml) available in stock.`,
        );
        return;
      }

      const nextQuantity = existing.quantity + delta;
      if (nextQuantity <= 0) {
        commit(current.filter((line) => line.key !== key));
        return;
      }

      commit(
        current.map((line) =>
          line.key === key ? { ...line, quantity: nextQuantity } : line,
        ),
      );
    },
    [showToast],
  );

  const removeItem = useCallback((key: string) => {
    commit(getSnapshot().filter((line) => line.key !== key));
  }, []);

  const clear = useCallback(() => commit(EMPTY), []);

  const count = useMemo(
    () => items.reduce((sum, line) => sum + line.quantity, 0),
    [items],
  );
  const subtotal = useMemo(
    () => items.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count,
      subtotal,
      isOpen,
      openCart,
      closeCart,
      toggleCart,
      addItem,
      updateQuantity,
      removeItem,
      clear,
    }),
    [
      items,
      count,
      subtotal,
      isOpen,
      openCart,
      closeCart,
      toggleCart,
      addItem,
      updateQuantity,
      removeItem,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
