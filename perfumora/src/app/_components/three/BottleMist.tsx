"use client";

import { useMemo } from "react";
import { CanvasTexture, Vector3 } from "three";
import type { BottleRefs } from "./useBottleRefs";

/**
 * Where the plume starts, right at the pump's nozzle orifice on the collar.
 */
const NOZZLE: [number, number, number] = [0.1, 1.05, 0.05];

/**
 * The cone the mist is scattered through:
 * Shoots horizontally to the right (+X) with a slight natural upward arc (+Y),
 * fanning out into an atomized cloud as seen in the reference image.
 */
const PLUME = { axis: [1.0, 0.12, 0.03], reach: 1.35, spread: 0.38 } as const;

/** Droplet count: rich atomized plume matching the reference photograph. */
const COUNT = 420;

/** Droplet diameter in world units — crisp, defined atomized particles. */
const DOT_SIZE = 0.03;

/** Opacity at the peak of the spray. */
export const MIST_OPACITY = 0.88;

/** How small the cloud starts at the nozzle orifice before bursting. */
export const MIST_COLLAPSED = 0.04;

const RENDER_ORDER = 3;

/**
 * Creates an atomized droplet map with deep warm charcoal/ink tint for strong,
 * crisp contrast against the light parchment page — exactly matching the reference.
 */
function createDroplet(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // High-contrast warm charcoal ink gradient: dense core, feathered mist rim
  gradient.addColorStop(0, "rgba(42, 34, 30, 0.95)");
  gradient.addColorStop(0.35, "rgba(54, 44, 38, 0.8)");
  gradient.addColorStop(0.65, "rgba(75, 62, 54, 0.35)");
  gradient.addColorStop(1, "rgba(75, 62, 54, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new CanvasTexture(canvas);
}

/** Droplet positions: fine atomized particles scattered through the cone plume. */
function createPlume(): Float32Array {
  const axis = new Vector3(...PLUME.axis).normalize();
  const across = new Vector3(0, 0, 1).cross(axis).normalize();
  const up = axis.clone().cross(across);

  const positions = new Float32Array(COUNT * 3);
  const point = new Vector3();

  for (let i = 0; i < COUNT; i++) {
    // Natural distribution: concentrated near nozzle, expanding outward
    const travel = Math.pow(Math.random(), 0.75);
    const radius = Math.sqrt(Math.random()) * (0.03 + PLUME.spread * travel);
    const angle = Math.random() * Math.PI * 2;
    // Gentle ballistic settling
    const drop = -0.04 * Math.pow(travel, 2);

    point
      .copy(axis)
      .multiplyScalar(travel * PLUME.reach)
      .addScaledVector(across, Math.cos(angle) * radius)
      .addScaledVector(up, Math.sin(angle) * radius + drop);

    point.toArray(positions, i * 3);
  }

  return positions;
}

interface BottleMistProps {
  refs: BottleRefs;
  /** Optional tint override; defaults to rich studio ink for maximum legibility */
  color?: string;
}

export function BottleMist({ refs, color }: BottleMistProps) {
  const positions = useMemo(() => createPlume(), []);
  const droplet = useMemo(() => createDroplet(), []);
  const { mist, mistMaterial } = refs;

  return (
    <points
      ref={mist}
      position={NOZZLE}
      scale={MIST_COLLAPSED}
      renderOrder={RENDER_ORDER}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={mistMaterial}
        color={color ?? "#322924"}
        map={droplet}
        size={DOT_SIZE}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
      />
    </points>
  );
}
