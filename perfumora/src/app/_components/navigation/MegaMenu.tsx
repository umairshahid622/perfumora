"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { useScent } from "../../_lib/scent-context";
import { VARIANTS, accentGlow, juiceColor } from "../../_lib/variants";
import { BottlePreview } from "./BottlePreview";

interface MegaMenuProps {
  open: boolean;
  onClose: () => void;
  /** Called once the close timeline has fully played out and the panel is gone from
   *  the screen — the closing click starts that, it doesn't end it. Lets
   *  <Navigation> keep the header's accent on "Fragrances" for as long as the panel
   *  is visible without restating this timeline's duration over there. */
  onClosed: () => void;
  /** Called once a fragrance is committed, for <Navigation> to close this panel
   *  and take the visitor to the Hero — which is a scroll on home but a route
   *  change from `/checkout` or `/collection`, a decision that belongs there. */
  onSelect: () => void;
}

/**
 * The "Fragrances" dropdown (§4.0): a floating, rounded dark panel that drops
 * from beneath the nav to nearly the full viewport height and nearly full width,
 * over a dimming scrim. Open/close is a GSAP height + opacity timeline (not a
 * `max-height` CSS transition, not a native <details>). Its links are shortcuts
 * into the Hero fragrance changer, not routes: selecting a family sets the live
 * variant and hands off to `onSelect` for the trip to the Hero.
 */
export function MegaMenu({ open, onClose, onClosed, onSelect }: MegaMenuProps) {
  const { setIndex, index } = useScent();
  const [hovered, setHovered] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      gsap.set(scrimRef.current, { autoAlpha: 0 });
      gsap.set(panelRef.current, { height: 0, autoAlpha: 0 });

      const items = listRef.current?.children;
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "power3.inOut" },
      });
      tl.to(scrimRef.current, { autoAlpha: 1, duration: 0.4 }, 0)
        // Full height: from the `top-[4.75rem]` anchor down to a 0.75rem gap
        // matching the `inset-x-3` sides, so the rounded card floats evenly on
        // all four edges. `dvh` (not `vh`) so the bottom tracks the visible
        // viewport instead of tucking under mobile browser chrome. GSAP tweens
        // the calc's numeric terms from 0, so this still animates from height 0.
        .to(
          panelRef.current,
          { height: "calc(100dvh - 4.75rem - 0.75rem)", autoAlpha: 1, duration: 0.55 },          
          0,
        )
        .from(
          items ? Array.from(items) : [],
          { yPercent: 60, autoAlpha: 0, stagger: 0.06, duration: 0.45 },
          0.18,
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
      // `progress()` fires no callbacks by design, so the close is reported by hand
      // here — otherwise the panel would jump shut without ever saying it had.
      if (!open) onClosed();
      return;
    }
    if (open) tl.play();
    else {
      // The reverse is the close, so its completion is the moment the panel is
      // actually gone. Attached before starting it, in case there is nothing to
      // rewind and it finishes at once.
      tl.eventCallback("onReverseComplete", onClosed);
      tl.reverse();
    }
  }, [open, onClosed]);

  const choose = (target: number) => {
    setIndex(target);
    onSelect();
  };

  // The vessel previews the hovered row, falling back to the committed selection.
  const displayIndex = hovered ?? index;
  const displayVariant = VARIANTS[displayIndex];

  return (
    <div ref={rootRef} aria-hidden={!open}>
      {/* Scrim */}
      <button
        ref={scrimRef}
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      />

      {/* Floating rounded panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Fragrances"
        className={cn(
          "bg-bg-dark text-paper fixed inset-x-3 top-19 z-50 overflow-hidden rounded-3xl md:inset-x-6",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {/* Close button, top-right. An explicit affordance beside the scrim's
            click-to-close. Kept out of `listRef` so the open timeline's item
            stagger doesn't sweep it; `tabIndex`/`aria-hidden` follow the scrim so
            it leaves the tab order while the panel is closed. */}
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={open ? 0 : -1}
          onClick={onClose}
          className="border-hairline-on-dark text-paper absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full border bg-white/10 transition-colors hover:bg-white/20 md:top-6 md:right-6"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="size-5"
          >
            <path d="M6 6 18 18M18 6 6 18" />
          </svg>
        </button>

        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-10 p-8 md:grid-cols-[1fr_1.4fr] md:grid-rows-[minmax(0,1fr)] md:p-14">
          <div className="relative flex flex-col">
            <span className="text-micro text-muted-on-dark font-medium uppercase">
              The Collection
            </span>

            {/* Live vessel preview — the hovered (or selected) fragrance's juice,
                tinted with `juiceColor` so the near-clear SKUs read as colour and
                match the 3D Hero bottle. Desktop only; the mobile menu leads with
                the list below. Left-aligned to share the column's text axis. */}
            <div className="relative hidden flex-1 items-center md:flex">
              {/* Sized to the artwork's own aspect ratio, so the glow inside can be
                  placed in vessel coordinates rather than column coordinates. */}
              <div className="relative aspect-[264/510] h-full max-h-[52vh]">
                {/* Accent glow, echoing the Hero wash (Hero.tsx) but centred on the
                    liquid — 75.5% down the artwork — and oversized so it reads as a
                    wash rather than a disc. Read from the previewed variant, not the
                    `--accent` token, so it tracks the hover instead of trailing the
                    committed selection. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[75.5%] left-1/2 h-[92%] w-[260%] -translate-x-1/2 -translate-y-1/2"
                  style={{
                    background: `radial-gradient(ellipse closest-side, ${accentGlow(displayVariant.hex)}, transparent 72%)`,
                  }}
                />
                <BottlePreview
                  liquidColor={juiceColor(displayVariant.hex)}
                  className="relative h-full w-full"
                />
              </div>
            </div>

            {/* Previewed name + catalogue position. */}
            <div className="hidden md:block">
              <p className="font-display text-4xl leading-none uppercase">
                {displayVariant.name}
              </p>
              <span className="text-micro text-muted-on-dark mt-2 block font-medium uppercase">
                {String(displayIndex + 1).padStart(2, "0")} / Parfum
              </span>
            </div>
          </div>

          <ul
            ref={listRef}
            onMouseLeave={() => setHovered(null)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setHovered(null);
            }}
            className="grid min-h-0 grid-cols-1 content-start gap-2 self-stretch overflow-y-auto sm:grid-cols-2 lg:grid-cols-3"
          >
            {VARIANTS.map((variant, i) => (
              <li key={variant.id}>
                <button
                  type="button"
                  onClick={() => choose(i)}
                  onMouseEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  className={cn(
                    "group flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors",
                    "hover:bg-white/5",
                    i === index && "bg-white/5",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="border-hairline-on-dark size-9 shrink-0 rounded-full border"
                    // Product swatch colour is variant data, not a design token.
                    style={{ backgroundColor: variant.hex }}
                  />
                  <span className="flex flex-col">
                    <span className="text-paper text-lg leading-tight font-medium">
                      {variant.name}
                    </span>
                    <span className="text-micro text-muted-on-dark font-medium uppercase">
                      {String(i + 1).padStart(2, "0")} / Parfum
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
