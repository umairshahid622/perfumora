"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../_lib/motion";

/** The wordmark, split per glyph so it can be revealed letter by letter. */
const WORDMARK = "PERFUMORA";

/**
 * How long, at most, the curtain waits on `window.load` before lifting anyway.
 * The reveal is gated on the real load event so it never lifts onto a
 * half-painted page, but a stalled sub-resource must not strand the visitor
 * behind a dark panel — the cap guarantees the site always appears.
 */
const LOAD_TIMEOUT_MS = 4000;

/**
 * The first-load curtain (§ boot screen). A full-viewport dark panel that reveals
 * the PERFUMORA wordmark glyph by glyph, fills an accent progress line to 100,
 * then lifts away to uncover the hero.
 *
 * It is mounted at the layout root and rendered on the server, so it is already
 * painting over the page on first frame — the point of a preloader is to be there
 * before anything else is, with no flash of unstyled content behind it. Being its
 * own client boundary keeps the rest of the layout a Server Component.
 *
 * The lift is gated on `window.load` (with `LOAD_TIMEOUT_MS` as a backstop) rather
 * than a fixed delay, so the intro animation doubles as cover for the real load
 * instead of merely preceding it. On completion the panel unmounts itself — a
 * fixed full-screen layer left in the tree would keep swallowing pointer events
 * over the whole site. Reduced motion skips straight to that unmount.
 *
 * Plays on every full load by design; scoping it to once per session would be a
 * `sessionStorage` guard here and nothing else.
 */
export function AppLoader() {
  const [done, setDone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  // Hold the page still while the curtain is up: with the panel sliding away on
  // its own timeline, a stray scroll underneath it would desync the reveal from
  // the hero it uncovers. Keyed on `done` so the lock lifts the moment the
  // curtain does, and restored on unmount either way.
  useEffect(() => {
    if (done) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, [done]);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      // Reduced motion wants the site, not the show: unmount now and let the
      // scroll-lock effect above release on the same commit.
      if (prefersReducedMotion()) {
        setDone(true);
        return;
      }

      // A decorative 0–100 readout, not real progress — it counts over the
      // intro's own duration. `padStart` keeps it three glyphs wide so the
      // tabular figures don't jitter their neighbours as they climb.
      const counter = { value: 0 };
      const paintCount = () => {
        if (countRef.current) {
          countRef.current.textContent = String(
            Math.round(counter.value),
          ).padStart(3, "0");
        }
      };

      // The lift, fired once both the intro has finished *and* the page has
      // loaded — whichever lands last calls this, and `revealed` makes the race
      // idempotent.
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        gsap.to(root, {
          yPercent: -100,
          duration: 0.9,
          ease: "power4.inOut",
          onComplete: () => setDone(true),
        });
      };

      let introDone = false;
      let pageLoaded = document.readyState === "complete";
      const tryReveal = () => {
        if (introDone && pageLoaded) reveal();
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

      // Glyphs rise into place a beat apart — the same entrance the fragrance
      // name uses, so the boot screen and the hero share a gesture. The letters
      // ship hidden (opacity-0 in the markup) and this fromTo drives them in, so
      // the server-rendered wordmark never flashes fully written before the
      // intro runs.
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
      // The line fills and the counter climbs together, overlapping the tail of
      // the wordmark so the two reads don't run end to end.
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
      className="bg-bg-dark fixed inset-0 z-[100] flex flex-col items-center justify-center gap-10"
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
      </div>
    </div>
  );
}
