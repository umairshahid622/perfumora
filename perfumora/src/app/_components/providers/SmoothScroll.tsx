"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * Ultra-high-performance global smooth scrolling provider.
 *
 * Uses frame-rate independent exponential lerp via GSAP's high-resolution ticker.
 * Eliminates tween allocation thrashing, supports 60Hz/120Hz ProMotion displays,
 * synchronizes GSAP ScrollTrigger timelines frame-by-frame, and sleeps at rest (0% CPU).
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const currentY = useRef<number>(0);
  const targetY = useRef<number>(0);
  const isRunning = useRef<boolean>(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    currentY.current = window.scrollY;
    targetY.current = window.scrollY;

    let vh = window.innerHeight;
    let maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);

    const measure = () => {
      vh = window.innerHeight;
      maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
      targetY.current = Math.max(0, Math.min(maxScroll, targetY.current));
    };

    window.addEventListener("resize", measure, { passive: true });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(document.body);

    const tick = (_time: number, deltaTime: number) => {
      // Delta-time based smoothing factor (~0.12 at 60fps, smoothly scaled for 120fps)
      const dt = Math.min(deltaTime / 1000, 0.1);
      const factor = 1 - Math.exp(-14 * dt);

      currentY.current += (targetY.current - currentY.current) * factor;

      if (Math.abs(targetY.current - currentY.current) < 0.5) {
        currentY.current = targetY.current;
        window.scrollTo(0, targetY.current);
        ScrollTrigger.update();
        gsap.ticker.remove(tick);
        isRunning.current = false;
        return;
      }

      window.scrollTo(0, currentY.current);
      ScrollTrigger.update();
    };

    const startTicker = () => {
      if (!isRunning.current) {
        isRunning.current = true;
        gsap.ticker.add(tick);
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [data-no-smooth-scroll], [role="dialog"], [aria-modal="true"]',
        )
      ) {
        return;
      }

      event.preventDefault();

      // Normalize scroll deltas across wheel vs trackpad modes
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? vh : 1;
      const delta = event.deltaY * unit * 0.95;

      // Keep target within page scroll boundaries
      targetY.current = Math.max(0, Math.min(maxScroll, targetY.current + delta));

      startTicker();
    };

    // Keep state in sync with any programmatic or browser-native scrolls
    const onExternalScroll = () => {
      if (!isRunning.current) {
        currentY.current = window.scrollY;
        targetY.current = window.scrollY;
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onExternalScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onExternalScroll);
      resizeObserver.disconnect();
      gsap.ticker.remove(tick);
      isRunning.current = false;
    };
  }, []);

  return <>{children}</>;
}

