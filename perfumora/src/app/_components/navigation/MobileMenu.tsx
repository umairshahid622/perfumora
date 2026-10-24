"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const CATEGORY_ORDER = ["Male", "Female", "Unisex"];

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

  const categoryGroups = useMemo(() => {
    const map = new Map<string, { variant: (typeof variants)[number]; originalIndex: number }[]>();

    variants.forEach((variant, originalIndex) => {
      const cat = variant.category || "Uncategorized";
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push({ variant, originalIndex });
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const idxA = CATEGORY_ORDER.indexOf(a);
        const idxB = CATEGORY_ORDER.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(([category, items]) => ({ category, items }));
  }, [variants]);

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
    if (!isHome) {
      onNavigateRoute("/");
    }
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
          "fixed inset-0 z-[70] bg-backdrop backdrop-blur-[4px]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      />

      {/* Slide-Down Mobile Drawer Card */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site Navigation"
        data-lenis-prevent
        className={cn(
          "bg-surface text-foreground fixed inset-x-3 top-3 z-[75] flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-border shadow-2xl",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {/* Drawer Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateHomeSection(SECTION_IDS.hero);
            }}
            className="font-display text-foreground text-xl tracking-[0.02em] uppercase"
          >
            Perfumora
          </button>

          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="border-border text-foreground flex size-10 items-center justify-center rounded-full border bg-secondary transition-colors hover:bg-secondary-hover active:scale-95"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Scrollable Navigation Body */}
        <div
          ref={contentRef}
          data-lenis-prevent
          className="flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-y-auto overscroll-contain px-6 py-6 touch-pan-y"
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
                  ? "text-accent-on-dark bg-secondary font-semibold"
                  : "text-foreground hover:text-accent-on-dark",
              )}
            >
              Home
            </button>

            {/* Fragrances Section with Sub-List Grouped by Categories */}
            <div className="flex flex-col rounded-xl bg-surface-sunken p-1">
              <button
                type="button"
                onClick={() => setFragrancesExpanded((prev) => !prev)}
                aria-expanded={fragrancesExpanded}
                className="flex items-center justify-between px-3 py-3 font-display text-2xl uppercase text-foreground transition-colors hover:text-accent-on-dark"
              >
                <span>Fragrances</span>
                <ChevronIcon
                  className={cn(
                    "size-4 transition-transform duration-300 ease-out",
                    fragrancesExpanded ? "rotate-180" : "rotate-0",
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
                  fragrancesExpanded
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0 pointer-events-none",
                )}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-3 pb-2 pt-1">
                    {categoryGroups.map(({ category, items }) => (
                      <div key={category} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between px-3 pt-2 pb-0.5 border-b border-border-subtle">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-on-dark">
                            {category}
                          </span>
                          <span className="text-[10px] font-mono text-subtle">
                            ({items.length})
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          {items.map(({ variant, originalIndex }) => {
                            const isSelected = originalIndex === index;
                            return (
                              <button
                                key={variant.id}
                                type="button"
                                tabIndex={fragrancesExpanded ? 0 : -1}
                                onClick={() => selectFragrance(originalIndex)}
                                className={cn(
                                  "flex items-center justify-between rounded-lg px-3 py-2 text-left transition-all active:scale-[0.98]",
                                  isSelected
                                    ? "bg-secondary text-foreground font-medium"
                                    : "hover:bg-secondary text-muted",
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    aria-hidden="true"
                                    className="size-3.5 shrink-0 rounded-full border border-border"
                                    style={{ backgroundColor: variant.hex }}
                                  />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground">
                                      {variant.name}
                                    </span>
                                    <span className="text-[10px] text-subtle font-medium uppercase">
                                      {variant.concentration ?? "Eau de Parfum"}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-micro font-sans uppercase text-subtle">
                                  {String(originalIndex + 1).padStart(2, "0")}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
                  ? "text-accent-on-dark bg-secondary font-semibold"
                  : "text-foreground hover:text-accent-on-dark",
              )}
            >
              Collection
            </button>
          </nav>

          {/* User Quick Actions in Drawer Footer — Bag Button */}
          <div className="border-t border-border pt-4 mt-auto">
            <button
              type="button"
              onClick={() => {
                onClose();
                onCartOpen();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-3.5 text-xs font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-secondary-hover active:scale-[0.99]"
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
