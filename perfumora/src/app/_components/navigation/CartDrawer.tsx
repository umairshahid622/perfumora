"use client";

import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { useCart } from "../../_lib/cart-context";
import { formatPrice } from "../../_lib/variants";
import { RippleButton } from "../ui/RippleButton";
import { CloseIcon } from "./icons";
import { usePathname } from "next/navigation";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Hand off to checkout: the drawer closes and routes to `/checkout`. Owned by
   *  <Navigation>, which owns the panel state and the router. */
  onCheckout: () => void;
}

/**
 * Cart drawer (§4.0): slides in from the right edge via a GSAP x-transform
 * (translate 100% → 0) over a scrim. Lists each line item (name + swatch, size,
 * qty, price) and a running subtotal. Checkout is not transacted here — the
 * button routes to `/checkout`, which owns the delivery details, the review and
 * the confirmation (§4.0).
 */
export function CartDrawer({ open, onClose, onCheckout }: CartDrawerProps) {
  const { items, subtotal, removeItem } = useCart();
  const pathName = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      gsap.set(scrimRef.current, { autoAlpha: 0 });
      gsap.set(panelRef.current, { xPercent: 100 });
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power4.inOut" } });
      tl.to(scrimRef.current, { autoAlpha: 1, duration: 0.4 }, 0).to(
        panelRef.current,
        { xPercent: 0, duration: 0.55 },
        0,
      );
      timeline.current = tl;
    },
    { scope: rootRef },
  );

  useEffect(() => {
    const tl = timeline.current;
    if (!tl) return;
    if (prefersReducedMotion()) {
      tl.progress(open ? 1 : 0).pause();
      return;
    }
    if (open) tl.play();
    else tl.reverse();
  }, [open]);

  return (
    <div ref={rootRef} aria-hidden={!open}>
      <button
        ref={scrimRef}
        type="button"
        aria-label="Close cart"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          // Above the header (z-60), unlike the mega-menu's scrim: that one is a
          // dropdown the header stays attached to, while this is a modal surface
          // drawn over the full height of the page. Leaving the nav lit above the
          // scrim also made `aria-modal` below a lie — its icons stayed live.
          "fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={cn(
          "bg-bg-light text-ink fixed inset-y-0 right-0 z-[80] flex w-full max-w-md flex-col",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <header className="border-hairline-on-light flex items-center justify-between border-b px-6 py-6">
          <h2 className="text-xl font-medium tracking-tight normal-case">Cart</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="text-ink hover:text-accent-on-light transition-colors"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {items.length === 0 ? (
            <p className="text-body text-muted-on-light mt-8 text-center">
              Your cart is empty.
            </p>
          ) : (
            <ul className="flex flex-col gap-6">
              {items.map((line) => (
                <li key={line.key} className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="border-hairline-on-light mt-1 size-10 shrink-0 rounded-full border"
                    style={{ backgroundColor: line.hex }}
                  />
                  <div className="flex-1">
                    <p className="text-base font-medium">{line.name}</p>
                    <p className="text-micro text-muted-on-light font-medium uppercase">
                      {line.size}ml · Qty {line.quantity}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-base font-medium">
                      {formatPrice(line.price * line.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(line.key)}
                      className="text-micro text-muted-on-light hover:text-accent-on-light font-medium uppercase transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-hairline-on-light border-t px-6 py-6">
          <div className="mb-5 flex items-baseline justify-between">
            <span className="text-micro text-muted-on-light font-medium uppercase">
              Subtotal
            </span>
            <span className="text-price text-accent-on-light font-display">
              {formatPrice(subtotal)}
            </span>
          </div>
          {

            pathName !== "/checkout" && (
              <RippleButton
                onClick={onCheckout}
                className="w-full"
                aria-label="Checkout"
                silent
              >
                Checkout
              </RippleButton>
            )            
          }
        </footer>
      </aside>
    </div>
  );
}
