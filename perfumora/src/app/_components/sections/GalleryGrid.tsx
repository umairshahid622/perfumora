"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";
import { cn } from "../../_lib/cn";
import { useSoundCue } from "../../_hooks/useSoundCue";
import type { Variant } from "../../_lib/variants";
import { Container } from "../ui/Container";
import { Eyebrow } from "../ui/Eyebrow";
import { RevealHeading } from "../ui/RevealHeading";
import { GalleryCard } from "./GalleryCard";

gsap.registerPlugin(ScrollTrigger);

const CATEGORY_TABS = [
  { key: "all", label: "All" },
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "unisex", label: "Unisex" },
] as const;

/**
 * The fragrance showcase grid, shared by the home teaser (<Gallery>, four cards)
 * and the `/collection` route (every card). Given the same treatment either way —
 * the drift keys off however many `.g-item`s render, so 4 and 24 behave alike.
 *
 * The motion is the point, and nothing here is a one-shot fade. Each card is
 * bound to scroll position with `scrub`, so as it climbs the viewport it drifts
 * through 3D space: it arcs in from alternating sides along a real curved path
 * (x runs on `sine.out`, y on `sine.in` — together they trace a quarter-circle),
 * turns in perspective (`rotationY`), tilts, scales up past 1 and settles, and
 * de-blurs — every property on its own ease and duration so they resolve
 * independently rather than in lockstep. `depth` (i % 3) sends some cards in
 * from further back for layered depth, and a giant wordmark drifts diagonally
 * behind them on its own slow parallax. Reduced motion leaves the whole grid in
 * its natural resting state — the drift start-states are only ever set when
 * motion runs.
 */
export function GalleryGrid({
  variants,
  eyebrow,
  title,
  showFilter = false,
}: {
  variants: readonly Variant[];
  eyebrow: string;
  title: string;
  showFilter?: boolean;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const tabsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gridRef = useRef<HTMLUListElement>(null);
  const isFirstRender = useRef(true);
  const { play } = useSoundCue();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: variants.length };
    variants.forEach((v) => {
      const cat = (v.categoryId || v.category || "").toLowerCase();
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [variants]);

  const displayVariants = useMemo(() => {
    if (!showFilter || selectedCategory === "all") return variants;
    return variants.filter((v) => {
      const cat = (v.categoryId || v.category || "").toLowerCase();
      return cat === selectedCategory.toLowerCase();
    });
  }, [variants, showFilter, selectedCategory]);

  const updateIndicator = (animate = true) => {
    const tabEl = tabsRef.current.get(selectedCategory);
    const container = filterContainerRef.current;
    const indicator = indicatorRef.current;
    if (!tabEl || !container || !indicator) return;

    const tabRect = tabEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const left = tabRect.left - containerRect.left;
    const top = tabRect.top - containerRect.top;
    const width = tabRect.width;
    const height = tabRect.height;

    if (!animate || prefersReducedMotion()) {
      gsap.set(indicator, {
        x: left,
        y: top,
        width,
        height,
        autoAlpha: 1,
      });
    } else {
      gsap.to(indicator, {
        x: left,
        y: top,
        width,
        height,
        autoAlpha: 1,
        duration: 0.38,
        ease: "power3.out",
        overwrite: "auto",
      });
    }
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      updateIndicator(false);
      return;
    }
    updateIndicator(true);
  }, [selectedCategory]);

  useEffect(() => {
    const handleResize = () => updateIndicator(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [selectedCategory]);

  // Staggered card entrance on category filter change
  useEffect(() => {
    if (!gridRef.current || prefersReducedMotion()) return;
    const cards = gridRef.current.children;
    if (!cards || cards.length === 0) return;

    gsap.fromTo(
      cards,
      { autoAlpha: 0, y: 22, scale: 0.96 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.45,
        stagger: 0.04,
        ease: "power2.out",
        overwrite: "auto",
        onComplete: () => {
          ScrollTrigger.refresh();
        },
      },
    );
  }, [selectedCategory]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      ScrollTrigger.refresh();
    }
  }, [displayVariants]);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      const q = gsap.utils.selector(scope);

      // Eyebrow: a short scrubbed rise as the section enters.
      gsap.fromTo(
        q(".g-head"),
        { autoAlpha: 0, y: 48 },
        {
          autoAlpha: 1,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: scope.current,
            start: "top 80%",
            end: "top 50%",
            scrub: 1,
          },
        },
      );

      // Depth layer: the oversized wordmark is far wider than the viewport, so a
      // right→left horizontal drift sweeps it by exactly its overflow — its left
      // end sits at the screen edge at the start and its right end at the other
      // edge by the finish, so the *whole* word is read across the section's
      // scroll. A gentle vertical drift keeps it floating behind the cards. Both
      // scale with layout and recompute on resize.
      const word = gsap.utils.toArray<HTMLElement>(".g-word", scope.current)[0];
      const driftX = () =>
        Math.max(0, ((word?.offsetWidth ?? 0) - window.innerWidth) / 2);
      const driftY = () => (scope.current?.offsetHeight ?? 0) * 0.12;
      gsap.fromTo(
        q(".g-word"),
        { x: () => driftX(), y: () => -driftY() },
        {
          x: () => -driftX(),
          y: () => driftY(),
          ease: "none",
          scrollTrigger: {
            trigger: scope.current,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );

      // Per-card 3D drift. Each card owns a timeline whose tweens share one
      // scroll span but run on different eases → independent, curved motion.
      const items = gsap.utils.toArray<HTMLElement>(".g-item", scope.current);
      items.forEach((item, i) => {
        const card = item.querySelector<HTMLElement>(".g-item-inner");
        if (!card) return;

        // A scrub timeline maps the card's transform onto the scroll it travels
        // between `start` and `end`. On the home teaser every card enters from
        // below the fold, so it begins at progress 0 (full offset) and drifts in
        // as you scroll. But on `/collection` the grid sits at the top of the
        // page: the first row loads already past the `top 90%` start line, so its
        // scrub would freeze mid-drift — offset, half-scaled, staggered — with no
        // scroll above it to ever resolve. A card already above that line at load
        // has no travel to animate through, so it stays at its resting grid state;
        // only cards still below the start get the drift. Measured off the same
        // 90% the trigger starts at, so the two can't disagree.
        if (item.getBoundingClientRect().top < window.innerHeight * 0.9) return;

        const side = i % 2 === 0 ? -1 : 1; // arc in from alternating sides
        const depth = i % 3; // 0/1/2 — deeper cards come from further back
        const xMag = 40 + depth * 12;
        const yMag = 55 + depth * 18;
        const rMag = 24 + depth * 8;

        const tl = gsap.timeline({
          scrollTrigger: { trigger: item, start: "top 90%", end: "top 44%", scrub: 1 },
        });

        // x + y on complementary sine eases trace a quarter-circle arc.
        tl.fromTo(
          card,
          { xPercent: side * xMag },
          { xPercent: 0, ease: "sine.out", duration: 1 },
          0,
        )
          .fromTo(
            card,
            { yPercent: yMag },
            { yPercent: 0, ease: "sine.in", duration: 1 },
            0,
          )
          .fromTo(
            card,
            { rotationY: side * rMag, rotationZ: side * 7, transformPerspective: 900 },
            { rotationY: 0, rotationZ: 0, ease: "power3.out", duration: 1 },
            0,
          )
          .fromTo(
            card,
            { scale: 0.88 - depth * 0.05 },
            { scale: 1, ease: "back.out(1.2)", duration: 1 },
            0,
          )
          .fromTo(
            card,
            { autoAlpha: 0 },
            { autoAlpha: 1, ease: "power1.out", duration: 0.6 },
            0,
          );
      });
    },
    { scope, dependencies: [displayVariants] },
  );

  return (
    <div ref={scope} className="relative w-full overflow-x-clip">
      {/* Parallax depth layer — a faint oversized wordmark behind the grid.
          Centred by its flex parent so GSAP owns the span's transform outright. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        <span className="g-word text-ink/[0.055] text-[26vw] leading-none font-semibold tracking-tighter uppercase select-none">
          Perfumora
        </span>
      </div>

      <Container className="relative z-10">
        <div className="flex flex-col gap-4">
          <Eyebrow className="g-head">{eyebrow}</Eyebrow>
          <RevealHeading className="text-section max-w-[18ch] text-balance">
            {title}
          </RevealHeading>

          {showFilter && (
            <div className="mt-6 flex items-center">
              <div className="max-w-full overflow-x-auto scrollbar-none py-1">
                <div
                  ref={filterContainerRef}
                  className="relative inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] p-1.5 backdrop-blur-md"
                >
                  {/* Smooth sliding active indicator pill */}
                  <span
                    ref={indicatorRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 left-0 rounded-full bg-ink shadow-md will-change-transform"
                    style={{ opacity: 0 }}
                  />

                  {CATEGORY_TABS.map((tab) => {
                    const active = selectedCategory === tab.key;
                    const count = categoryCounts[tab.key] ?? 0;
                    return (
                      <button
                        key={tab.key}
                        ref={(el) => {
                          if (el) tabsRef.current.set(tab.key, el);
                          else tabsRef.current.delete(tab.key);
                        }}
                        type="button"
                        onClick={() => {
                          if (selectedCategory !== tab.key) {
                            play();
                            setSelectedCategory(tab.key);
                          }
                        }}
                        className={cn(
                          "relative z-10 flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-semibold tracking-wider uppercase transition-colors duration-200 active:scale-95",
                          active
                            ? "text-paper"
                            : "text-ink/65 hover:text-ink",
                        )}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono leading-none transition-colors duration-200",
                            active
                              ? "bg-white/20 text-paper"
                              : "bg-ink/5 text-ink/50",
                          )}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {displayVariants.length === 0 ? (
          <div className="mt-14 rounded-2xl border border-ink/10 bg-bg-light/50 p-12 text-center text-muted-on-light">
            <p className="text-base font-medium text-ink">
              No fragrances found in this category.
            </p>
            <p className="mt-1 text-sm text-ink/60">
              Try selecting another category or view all fragrances.
            </p>
          </div>
        ) : (
          <ul
            ref={gridRef}
            className="mt-14 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 md:mt-20 md:grid-cols-3 md:gap-y-16 lg:grid-cols-4"
          >
            {displayVariants.map((v, i) => (
              <GalleryCard
                key={v.id}
                variant={v}
                position={String(i + 1).padStart(2, "0")}
              />
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}
