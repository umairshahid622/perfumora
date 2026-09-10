"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";
import { prefersReducedMotion } from "../../_lib/motion";

gsap.registerPlugin(ScrollTrigger);

export interface ScrollSceneProgress {
  /** The smoothed, clamped progress across the stage (0 to 1) */
  currentProgress: number;
  /** Normalized progress within Hero -> Manifesto transition (0 to 1) */
  manifestoProgress: number;
  /** Normalized progress within Manifesto -> Ritual transition (0 to 1) */
  ritualProgress: number;
  /** Normalized progress within Ritual -> Showcase transition (0 to 1) */
  showcaseProgress: number;
  /** Instantaneous scroll velocity */
  velocity: number;
}

/**
 * Step 2: Decoupled 3D Scene Damping & Progress Controller.
 *
 * Maintains a `targetProgress` from ScrollTrigger (numeric scrub) and calculates
 * a damped, per-frame clamped `currentProgress` inside the R3F render loop.
 * Guarantees that 3D object / camera transforms never jump or teleport on violent scroll bursts.
 */
export function useScrollScene(
  triggerSelector = "[data-opening-stage]",
  onFrameUpdate?: (progress: ScrollSceneProgress) => void,
) {
  const targetProgress = useRef<number>(0);
  const currentProgress = useRef<number>(0);
  const prevProgress = useRef<number>(0);
  const velocity = useRef<number>(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const triggerEl = document.querySelector<HTMLElement>(triggerSelector);
    if (!triggerEl) return;

    // Master stage ScrollTrigger with numeric lag-catchup scrub
    const st = ScrollTrigger.create({
      trigger: triggerEl,
      start: "top top",
      end: "bottom top",
      scrub: 1.2,
      onUpdate: (self) => {
        targetProgress.current = self.progress;
      },
    });

    return () => st.kill();
  }, [triggerSelector]);

  useFrame((_state, delta) => {
    // 1. Delta damping calculation
    const diff = targetProgress.current - currentProgress.current;

    // 2. Per-frame clamp prevents any violent jump or teleportation (clamp to [-0.02, 0.02])
    const clampedDiff = THREE.MathUtils.clamp(diff, -0.02, 0.02);

    // 3. Smooth damping integration decoupled from raw scroll bursts
    const factor = Math.min(1, 0.08 * (delta * 60));
    currentProgress.current += clampedDiff * Math.max(0.4, factor);

    // Velocity computation
    velocity.current =
      Math.abs(currentProgress.current - prevProgress.current) / (delta || 0.016);
    prevProgress.current = currentProgress.current;

    // Normalized per-section progress mappings across 500vh stage
    const p = currentProgress.current;
    const manifestoProgress = THREE.MathUtils.clamp(p / 0.25, 0, 1);
    const ritualProgress = THREE.MathUtils.clamp((p - 0.25) / 0.25, 0, 1);
    const showcaseProgress = THREE.MathUtils.clamp((p - 0.55) / 0.35, 0, 1);

    if (onFrameUpdate) {
      onFrameUpdate({
        currentProgress: p,
        manifestoProgress,
        ritualProgress,
        showcaseProgress,
        velocity: velocity.current,
      });
    }
  });

  return {
    targetProgress,
    currentProgress,
    velocity,
  };
}
