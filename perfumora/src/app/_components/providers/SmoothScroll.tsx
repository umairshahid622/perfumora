"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

const LenisContext = createContext<Lenis | null>(null);

export function useLenis() {
  return useContext(LenisContext);
}

/**
 * Step 1: Root Smooth Scroll Provider using Lenis + GSAP ScrollTrigger.
 *
 * - Intercepts native wheel/touch scroll and computes an eased, continuous scroll position.
 * - Duration: 1.2s, cubic ease-out: (t) => 1 - Math.pow(1 - t, 3)
 * - Ticked via GSAP's internal high-resolution RAF loop.
 * - Explicitly synchronizes ScrollTrigger on every Lenis scroll tick.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const [lenisInstance, setLenisInstance] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    // 1. Initialize Lenis with calibrated resistance against fast scroll bursts
    const lenis = new Lenis({
      duration: 1.4,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 0.55,
      touchMultiplier: 0.85,
      infinite: false,
    });

    lenisRef.current = lenis;
    setLenisInstance(lenis);

    // 2. Direct GSAP ScrollTrigger update from Lenis scroll events
    lenis.on("scroll", ScrollTrigger.update);

    // 3. Drive Lenis updates inside GSAP's RAF ticker loop
    const update = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(update);
      lenis.destroy();
      lenisRef.current = null;
      setLenisInstance(null);
    };
  }, []);

  return (
    <LenisContext.Provider value={lenisInstance}>
      {children}
    </LenisContext.Provider>
  );
}



