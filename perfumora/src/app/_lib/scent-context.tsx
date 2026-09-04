"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  accentGlow,
  readableAccent,
  readableAccentOnDark,
  type Variant,
} from "./variants";

/**
 * Owns the single piece of "which fragrance is selected" state and lifts it to
 * the page root (§5) so the nav, the Hero and any section below can read it,
 * while the Hero's arrows remain the only thing that calls the setter.
 *
 * It is also where the catalogue itself lands. The fragrance list is read from
 * Supabase on the server (`catalogue.ts`) and handed down through
 * `<AppProviders>`, so this provider re-publishes it on the context: every client
 * component that needs the list — the mega menu, the home gallery — reads it from
 * here rather than importing a module-level array, and there is exactly one copy
 * of it in the tree.
 *
 * Its side effect is the design system's live wiring: whenever the variant
 * changes it rewrites `--accent`, `--accent-contrast`, `--accent-glow` and the two
 * foreground forms `--accent-on-light` / `--accent-on-dark` on
 * the document root, so every token-driven surface (price, CTA, glow, active
 * states) reflects the current SKU without any component knowing a hex value.
 *
 * NOTE: the *coordinated* GSAP colour tween (mid-spin colour shift → sparkle) is
 * the rest of the fragrance-changer module (§6.3 #10). This provider holds the
 * state, syncs the tokens, and records which way the last change travelled so
 * the 3D bottle can turn that way; the colour/sparkle beats layer on later.
 */
interface ScentContextValue {
  /** The whole catalogue, in scroll/arrow order. Never empty. */
  variants: readonly Variant[];
  variant: Variant;
  index: number;
  count: number;
  /**
   * Which way the last change travelled: +1 forward, -1 back. The index alone
   * cannot say — stepping forward off the end wraps 3 → 0, which is
   * indistinguishable from three steps backwards.
   */
  direction: number;
  setIndex: (index: number) => void;
  next: () => void;
  prev: () => void;
}

const ScentContext = createContext<ScentContextValue | null>(null);

export function ScentProvider({
  variants,
  children,
}: {
  variants: readonly Variant[];
  children: ReactNode;
}) {
  const [index, setIndexRaw] = useState(0);
  const [direction, setDirection] = useState(1);
  const count = variants.length;
  const variant = variants[index];

  // Direction is recorded by the caller that knows it rather than derived from
  // the index delta, and travels with the new index so both land in one render.
  const go = useCallback(
    (to: number, towards: number) => {
      setIndexRaw(((to % count) + count) % count);
      setDirection(towards);
    },
    [count],
  );

  const setIndex = useCallback(
    (to: number) => go(to, to < index ? -1 : 1),
    [go, index],
  );
  const next = useCallback(() => go(index + 1, 1), [go, index]);
  const prev = useCallback(() => go(index - 1, -1), [go, index]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", variant.hex);
    root.style.setProperty(
      "--accent-contrast",
      variant.contrast === "ink" ? "var(--ink)" : "var(--paper)",
    );
    root.style.setProperty("--accent-glow", accentGlow(variant.hex));
    // Legible-on-parchment accent for text/borders; fills + glow keep the true hex.
    root.style.setProperty("--accent-on-light", readableAccent(variant.hex));
    // The same foreground over the near-black sections, where the on-light form is
    // the dimmest thing in a row of paper-white text.
    root.style.setProperty("--accent-on-dark", readableAccentOnDark(variant.hex));
  }, [variant]);

  const value = useMemo<ScentContextValue>(
    () => ({ variants, variant, index, count, direction, setIndex, next, prev }),
    [variants, variant, index, count, direction, setIndex, next, prev],
  );

  return <ScentContext.Provider value={value}>{children}</ScentContext.Provider>;
}

export function useScent(): ScentContextValue {
  const ctx = useContext(ScentContext);
  if (!ctx) throw new Error("useScent must be used within <ScentProvider>");
  return ctx;
}
