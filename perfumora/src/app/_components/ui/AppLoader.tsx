"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "../../_lib/motion";
import {
  getOrCreateAudioContext,
  triggerTactileClick,
} from "../../_lib/sound-context";

/** The wordmark, split per glyph so it can be revealed letter by letter. */
const WORDMARK = "PERFUMORA";

/**
 * How long, at most, the curtain waits on `window.load` before lifting anyway.
 */
const LOAD_TIMEOUT_MS = 4000;

/**
 * The first-load curtain (§ boot screen). A full-viewport dark panel that reveals
 * the PERFUMORA wordmark glyph by glyph, fills an accent progress line to 100,
 * and invites the customer to enter the sensory experience.
 *
 * Interacting with the loader provides the necessary browser user gesture
 * to warm and unlock the Web Audio API context for seamless spatial sound cues.
 */
export function AppLoader() {
  const [done, setDone] = useState(false);
  const [readyToEnter, setReadyToEnter] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const enterBtnRef = useRef<HTMLButtonElement>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hold the page still while the curtain is up
  useEffect(() => {
    if (done) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, [done]);

  const handleEnter = useCallback(() => {
    // Warm / resume AudioContext inside direct user interaction gesture
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    triggerTactileClick();

    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    const root = rootRef.current;
    if (!root) {
      setDone(true);
      ScrollTrigger.refresh();
      return;
    }

    gsap.killTweensOf(root);
    gsap.to(root, {
      yPercent: -100,
      duration: 0.85,
      ease: "power4.inOut",
      onComplete: () => {
        setDone(true);
        ScrollTrigger.refresh();
      },
    });
  }, []);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      // Reduced motion skips straight to unmount
      if (prefersReducedMotion()) {
        setDone(true);
        return;
      }

      const counter = { value: 0 };
      const paintCount = () => {
        if (countRef.current) {
          countRef.current.textContent = String(
            Math.round(counter.value),
          ).padStart(3, "0");
        }
      };

      let introDone = false;
      let pageLoaded = document.readyState === "complete";

      const tryReveal = () => {
        if (introDone && pageLoaded) {
          setReadyToEnter(true);
          // Graceful fallback auto-lift after 2.2s so visitor is never blocked
          autoTimerRef.current = setTimeout(() => {
            handleEnter();
          }, 2200);
        }
      };

      const onLoad = () => {
        pageLoaded = true;
        tryReveal();
      };
      if (!pageLoaded) window.addEventListener("load", onLoad, { once: true });
      const cap = window.setTimeout(onLoad, LOAD_TIMEOUT_MS);

      const tl = gsap.timeline({
        onComplete: () => {
          introDone = true;
          tryReveal();
        },
      });

      tl.fromTo(
        ".loader-letter",
        { yPercent: 60, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.055,
          ease: "power3.out",
        },
      );

      tl.fromTo(
        barRef.current,
        { scaleX: 0 },
        {
          scaleX: 1,
          transformOrigin: "left center",
          duration: 1.1,
          ease: "power1.inOut",
        },
        "-=0.25",
      );

      tl.to(
        counter,
        { value: 100, duration: 1.1, ease: "power1.inOut", onUpdate: paintCount },
        "<",
      );

      return () => {
        window.removeEventListener("load", onLoad);
        window.clearTimeout(cap);
        if (autoTimerRef.current) {
          clearTimeout(autoTimerRef.current);
          autoTimerRef.current = null;
        }
      };
    },
    { scope: rootRef },
  );

  if (done) return null;

  return (
    <div
      ref={rootRef}
      role="status"
      aria-label="Loading Perfumora"
      onClick={handleEnter}
      className="bg-bg-dark fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-8 md:gap-10 select-none"
    >
      <h1
        aria-hidden="true"
        className="font-display text-paper flex text-[clamp(2.5rem,9vw,7rem)] leading-none uppercase tracking-[0.1em] select-none"
      >
        {WORDMARK.split("").map((letter, i) => (
          <span key={i} className="loader-letter inline-block opacity-0">
            {letter}
          </span>
        ))}
      </h1>

      <div className="flex flex-col items-center gap-3">
        {/* Faint track with the accent fill growing across it from the left. */}
        <span className="bg-hairline-on-dark block h-px w-40 overflow-hidden md:w-56">
          <span ref={barRef} className="bg-accent block h-full w-full" />
        </span>
        <span
          ref={countRef}
          className="text-micro text-muted-on-dark font-medium tabular-nums"
        >
          000
        </span>

        {/* Enter Experience interactive trigger */}
        <div
          className={`transition-all duration-500 mt-2 ${
            readyToEnter
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <button
            ref={enterBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEnter();
            }}
            className="font-sans text-micro tracking-[0.25em] uppercase text-paper/85 hover:text-paper border border-paper/25 hover:border-paper/70 px-5 py-2 rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
          >
            Enter Perfumora
          </button>
        </div>
      </div>
    </div>
  );
}
