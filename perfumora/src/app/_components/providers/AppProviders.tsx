"use client";

import type { ReactNode } from "react";
import { CartProvider } from "../../_lib/cart-context";
import { ScentProvider } from "../../_lib/scent-context";
import { SoundProvider } from "../../_lib/sound-context";
import { RouteTransitionProvider } from "./RouteTransition";

/**
 * The one client boundary that hosts the page-root providers (§5): the mute
 * switch, the cart, and the selected scent (which drives the live `--accent`).
 * `page.tsx` stays a Server Component and passes the sections through as
 * `children`, so only the interactive pieces opt into the client.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SoundProvider>
      <CartProvider>
        <ScentProvider>
          <RouteTransitionProvider>{children}</RouteTransitionProvider>
        </ScentProvider>
      </CartProvider>
    </SoundProvider>
  );
}
