"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { cn } from "../../_lib/cn";
import { prefersReducedMotion } from "../../_lib/motion";
import { useSoundCue } from "../../_hooks/useSoundCue";

/**
 * The seven bars, drawn at their *resting* heights and centred on y=12 so a
 * scaleY tween from "center center" grows them symmetrically. Authoring the rest
 * shape as real geometry (rather than scaling into it) means scaleY = 1 *is* the
 * idle waveform — the silhouette from the brief, tallest in the middle.
 */
const BARS = [
  { x: 2.1, y: 8.5, h: 7 },
  { x: 5.1, y: 7.0, h: 10 },
  { x: 8.1, y: 5.5, h: 13 },
  { x: 11.1, y: 4.5, h: 15 },
  { x: 14.1, y: 5.5, h: 13 },
  { x: 17.1, y: 7.0, h: 10 },
  { x: 20.1, y: 8.5, h: 7 },
];

/**
 * Per-bar dance: each bar bobs between `min` and `max` (× its rest height) on its
 * own period, so the row never marches in lockstep — a loose, organic equaliser.
 * The peaks stay ≤ ~1.15 so the tallest bar can pump up without leaving the box.
 */
const DANCE = [
  { min: 0.35, max: 1.0, dur: 0.42, delay: 0.0 },
  { min: 0.4, max: 1.05, dur: 0.34, delay: 0.08 },
  { min: 0.45, max: 1.1, dur: 0.28, delay: 0.16 },
  { min: 0.5, max: 1.12, dur: 0.24, delay: 0.05 },
  { min: 0.45, max: 1.1, dur: 0.3, delay: 0.13 },
  { min: 0.4, max: 1.05, dur: 0.36, delay: 0.02 },
  { min: 0.35, max: 1.0, dur: 0.4, delay: 0.1 },
];

/** Muted: bars flatten to a dim baseline of dots. */
const MUTED_SCALE = 0.12;

/**
 * The global mute toggle (§4.0), drawn as an animated waveform. It reads/writes
 * the single mute switch through `useSoundCue` (the same hook every sound
 * consumer uses) and animates its seven bars with GSAP across three states:
 *
 *   - muted        → bars flatten to a dim baseline
 *   - idle         → bars rest at the waveform silhouette
 *   - a cue plays  → bars "dance" (per-bar scaleY bob) for exactly as long as the
 *                    clip sounds, driven by the shared `isPlaying` flag, then settle
 *
 * It never plays or loops audio itself; it only visualises what `play()` fires
 * elsewhere. The dance is a one-shot's *visual* — it stops on the clip's `ended`,
 * so there is still no ambient/looping motion (§1).
 */
export function SoundToggle({ className }: { className?: string }) {
  const { isMuted, toggleMute, isPlaying } = useSoundCue();
  const scopeRef = useRef<HTMLButtonElement>(null);
  const danceRef = useRef<gsap.core.Tween[]>([]);
  const firstRun = useRef(true);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    const bars = gsap.utils.toArray<SVGRectElement>(".wave-bar", scope);
    if (!bars.length) return;

    const reduced = prefersReducedMotion();
    const snap = firstRun.current || reduced;
    firstRun.current = false;

    // Clear whatever was running (a dance, or an in-flight settle) before the
    // next state takes over, so states never stack.
    danceRef.current.forEach((t) => t.kill());
    danceRef.current = [];
    gsap.killTweensOf(bars);

    if (isMuted) {
      gsap.to(bars, {
        scaleY: MUTED_SCALE,
        opacity: 0.4,
        transformOrigin: "center center",
        duration: snap ? 0 : 0.3,
        ease: "power2.out",
        stagger: snap ? 0 : 0.02,
      });
      return;
    }

    if (isPlaying && !reduced) {
      gsap.set(bars, { opacity: 1 });
      danceRef.current = bars.map((bar, i) =>
        gsap.fromTo(
          bar,
          { scaleY: DANCE[i].max },
          {
            scaleY: DANCE[i].min,
            duration: DANCE[i].dur,
            delay: DANCE[i].delay,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
            transformOrigin: "center center",
          },
        ),
      );
      return;
    }

    // Idle (or reduced motion): settle back to the resting waveform.
    gsap.to(bars, {
      scaleY: 1,
      opacity: 1,
      transformOrigin: "center center",
      duration: snap ? 0 : 0.4,
      ease: "power3.out",
      stagger: snap ? 0 : 0.03,
    });
  }, [isMuted, isPlaying]);

  // Kill the dance if the toggle unmounts mid-cue.
  useEffect(() => () => danceRef.current.forEach((t) => t.kill()), []);

  return (
    <button
      ref={scopeRef}
      type="button"
      onClick={toggleMute}
      aria-pressed={!isMuted}
      aria-label={isMuted ? "Unmute interaction sounds" : "Mute interaction sounds"}
      className={cn(
        // No colour of its own: it inherits the header's, which the nav's tone
        // swap tweens between ink and paper per section. The rounded border and
        // the bars both track that currentColor, so the control reads on either.
        "hover:text-accent-on-light hover:border-accent-on-light grid size-10 place-items-center rounded-full border border-current/25 transition-colors",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="size-5"
      >
        {BARS.map((bar, i) => (
          <rect
            key={i}
            className="wave-bar"
            x={bar.x}
            y={bar.y}
            width={1.8}
            height={bar.h}
            rx={0.9}
          />
        ))}
      </svg>
    </button>
  );
}
