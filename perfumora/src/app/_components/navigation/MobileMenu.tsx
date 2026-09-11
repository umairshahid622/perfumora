"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { useScent } from "../../_lib/scent-context";
import { SECTION_IDS } from "../../_lib/sections";
import { ChevronIcon, CloseIcon, BagIcon } from "./icons";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  onNavigateHomeSection: (sectionId: string) => void;
  onNavigateRoute: (href: string) => void;
  activeSection: string | null;
  pathname: string;
  onCartOpen: () => void;
  cartCount: number;
}

export function MobileMenu({
  open,
  onClose,
  onNavigateHomeSection,
  onNavigateRoute,
  activeSection,
  pathname,
  onCartOpen,
  cartCount,
}: MobileMenuProps) {
  const { variants, index, setIndex } = useScent();
  const [fragrancesExpanded, setFragrancesExpanded] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      gsap.set(scrimRef.current, { autoAlpha: 0 });
      gsap.set(drawerRef.current, { yPercent: -100, autoAlpha: 0 });

      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "power3.inOut" },
      });

      tl.to(scrimRef.current, { autoAlpha: 1, duration: 0.35 }, 0)
        .to(
          drawerRef.current,
          { yPercent: 0, autoAlpha: 1, duration: 0.45 },
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
    if (open) {
      tl.play();
    } else {
      tl.reverse();
    }
  }, [open]);

  const selectFragrance = (idx: number) => {
    setIndex(idx);
    onClose();
    onNavigateHomeSection(SECTION_IDS.hero);
  };

  const isHome = pathname === "/";
  const isCollection = pathname === "/collection";

  return (
    <div ref={rootRef} aria-hidden={!open} className="md:hidden">
      {/* Dimmed Scrim */}
      <button
        ref={scrimRef}
        type="button"
        aria-label="Close mobile menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[70] bg-black/60 backdrop-blur-[4px]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      />

      {/* Slide-Down Mobile Drawer Card */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site Navigation"
        className={cn(
          "bg-bg-dark text-paper fixed inset-x-3 top-3 z-[75] flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-white/10 shadow-2xl",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateHomeSection(SECTION_IDS.hero);
            }}
            className="font-display text-paper text-xl tracking-[0.02em] uppercase"
          >
            Perfumora
          </button>

          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="border-hairline-on-dark text-paper flex size-10 items-center justify-center rounded-full border bg-white/10 transition-colors hover:bg-white/20 active:scale-95"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Scrollable Navigation Body */}
        <div
          ref={contentRef}
          className="flex flex-1 flex-col justify-between gap-6 overflow-y-auto overscroll-contain px-6 py-6"
        >
          {/* Main Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateHomeSection(SECTION_IDS.hero);
              }}
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-3 text-left font-display text-2xl uppercase transition-colors",
                isHome && activeSection === SECTION_IDS.hero
                  ? "text-accent-on-dark bg-white/5 font-semibold"
                  : "text-paper hover:text-accent-on-dark",
              )}
            >
              Home

            </button>

            {/* Fragrances Section with Sub-List */}
            <div className="flex flex-col rounded-xl bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setFragrancesExpanded((prev) => !prev)}
                className="flex items-center justify-between px-3 py-3 font-display text-2xl uppercase text-paper transition-colors hover:text-accent-on-dark"
              >
                <span>Fragrances</span>
                <ChevronIcon
                  className={cn(
                    "size-4 transition-transform duration-300",
                    fragrancesExpanded ? "rotate-180" : "rotate-0",
                  )}
                />
              </button>

              {fragrancesExpanded && (
                <div className="grid grid-cols-1 gap-1.5 pb-2 pt-1">
                  {variants.map((variant, i) => {
                    const isSelected = i === index;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => selectFragrance(i)}
                        className={cn(
                          "flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-all active:scale-[0.98]",
                          isSelected
                            ? "bg-white/10 text-paper font-medium"
                            : "hover:bg-white/5 text-white/75",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="size-4 shrink-0 rounded-full border border-white/20"
                            style={{ backgroundColor: variant.hex }}
                          />
                          <span className="text-sm font-medium">{variant.name}</span>
                        </div>
                        <span className="text-micro font-sans uppercase text-white/40">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateRoute("/collection");
              }}
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-3 text-left font-display text-2xl uppercase transition-colors",
                isCollection
                  ? "text-accent-on-dark bg-white/5 font-semibold"
                  : "text-paper hover:text-accent-on-dark",
              )}
            >
              Collection
            </button>
          </nav>

          {/* User Quick Actions in Drawer Footer — Bag Button */}
          <div className="border-t border-white/10 pt-4 mt-auto">
            <button
              type="button"
              onClick={() => {
                onClose();
                onCartOpen();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3.5 text-xs font-medium uppercase tracking-wider text-paper transition-colors hover:bg-white/10 active:scale-[0.99]"
            >
              <BagIcon className="size-4" />
              <span>View Bag ({cartCount})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
