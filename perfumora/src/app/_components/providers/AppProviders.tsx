"use client";

import type { ReactNode } from "react";
import { CartProvider } from "../../_lib/cart-context";
import { ScentProvider } from "../../_lib/scent-context";
import { SoundProvider } from "../../_lib/sound-context";
import type { Variant } from "../../_lib/variants";
import { RouteTransitionProvider } from "./RouteTransition";

/**
 * The one client boundary that hosts the page-root providers (§5): the mute
 * switch, the cart, and the selected scent (which drives the live `--accent`).
 * `page.tsx` stays a Server Component and passes the sections through as
 * `children`, so only the interactive pieces opt into the client.
 *
 * The catalogue arrives as a prop rather than being imported: it is read from
 * Supabase in the root layout, on the server, and crosses this boundary as plain
 * serialisable data. That keeps the database credentials out of the bundle and
 * makes `<ScentProvider>` the single source every client component reads the
 * fragrance list from.
 */
export function AppProviders({
  variants,
  children,
}: {
  variants: readonly Variant[];
  children: ReactNode;
}) {
  return (
    <SoundProvider>
      <CartProvider>
        <ScentProvider variants={variants}>
          <RouteTransitionProvider>{children}</RouteTransitionProvider>
        </ScentProvider>
      </CartProvider>
    </SoundProvider>
  );
}
