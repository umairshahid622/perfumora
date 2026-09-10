"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollToPlugin, ScrollTrigger);

/**
 * Global smooth scrolling provider for the whole application.
 *
 * Drives wheel input with GSAP's ScrollToPlugin for silky-smooth momentum and
 * keeps ScrollTrigger scrubbed timelines updated in real time at 60fps.
 * Respects prefers-reduced-motion and preserves natural scrolling inside forms
 * and modal overlays.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const scrollTarget = useRef<number | null>(null);
  const scrollTween = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let vh = window.innerHeight;
    let maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);

    const measure = () => {
      vh = window.innerHeight;
      maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    };

    window.addEventListener("resize", measure);
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(document.body);

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

      const current = window.scrollY;
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? vh : 1;
      const base =
        scrollTarget.current !== null &&
        Math.abs(current - scrollTarget.current) < 600
          ? scrollTarget.current
          : current;

      const delta = Math.max(
        -200,
        Math.min(200, event.deltaY * unit * 0.55),
      );

      const next = Math.max(0, Math.min(maxScroll, base + delta));
      scrollTarget.current = next;

      scrollTween.current?.kill();
      scrollTween.current = gsap.to(window, {
        duration: 0.55,
        ease: "power2.out",
        scrollTo: { y: next, autoKill: false },
        overwrite: true,
        onUpdate: () => {
          ScrollTrigger.update();
        },
        onComplete: () => {
          if (Math.abs(window.scrollY - next) < 2) {
            scrollTarget.current = null;
            scrollTween.current = null;
          }
        },
      });
    };

    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("wheel", onWheel);
      resizeObserver.disconnect();
      scrollTween.current?.kill();
    };
  }, []);

  return <>{children}</>;
}
