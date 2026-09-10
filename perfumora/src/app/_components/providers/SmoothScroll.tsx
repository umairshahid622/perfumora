"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * Global smooth scrolling powered by Lenis + GSAP ScrollTrigger.
 *
 * Provides natural trackpad 1:1 fidelity, buttery mouse wheel momentum,
 * and frame-perfect synchronization with GSAP ScrollTrigger and Three.js scenes.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      duration: 2.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -8 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 0.35,
      touchMultiplier: 0.5,
      autoResize: true,
      infinite: false,
    });

    lenisRef.current = lenis;

    // Non-linear viscous resistance interceptor:
    // Allows gentle, delicate scrolling while enforcing heavy resistance against rapid swipes,
    // establishing a strict speed ceiling so 3D scenes and transitions can never be skipped.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [data-no-smooth-scroll], [role="dialog"], [aria-modal="true"]',
        )
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const rawDelta = e.deltaY * unit;
      const sign = Math.sign(rawDelta);
      const abs = Math.abs(rawDelta);

      // Viscous power compression + speed ceiling (max 32px per tick)
      const resisted = sign * Math.min(32, Math.pow(abs, 0.65) * 2.2);

      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const current = lenis.targetScroll ?? window.scrollY;
      const nextY = Math.max(0, Math.min(maxScroll, current + resisted));

      lenis.scrollTo(nextY, {
        immediate: false,
        duration: 1.8,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -8 * t)),
      });
    };

    // Connect Lenis scroll to ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);

    // Sync Lenis RAF with GSAP's internal ticker for rock-solid 60/120fps sync
    const update = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      gsap.ticker.remove(update);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return <>{children}</>;
}


