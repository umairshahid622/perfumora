"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SizeMl, VariantId } from "./variants";

/**
 * Cart state (§5): a plain array of line items plus add/remove/clear, held in a
 * small Context at the page root so both the Hero's Add-to-Cart and the nav's
 * cart drawer read and write the same list. UI/local state only — no
 * persistence, no order backend, no payment integration (§1, §2.11).
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
}

export interface AddToCartInput {
  variantId: VariantId;
  name: string;
  hex: string;
  size: SizeMl;
  price: number;
}

interface CartContextValue {
  items: CartLine[];
  count: number;
  subtotal: number;
  addItem: (input: AddToCartInput) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);

  const addItem = useCallback((input: AddToCartInput) => {
    const key = `${input.variantId}-${input.size}`;
    setItems((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { ...input, key, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((current) => current.filter((line) => line.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(
    () => items.reduce((sum, line) => sum + line.quantity, 0),
    [items],
  );
  const subtotal = useMemo(
    () => items.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({ items, count, subtotal, addItem, removeItem, clear }),
    [items, count, subtotal, addItem, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
