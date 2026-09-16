"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Vector3 } from "three";
import type { BottleRefs } from "./useBottleRefs";

/**
 * Where the plume starts before the first frame has run. The live position is
 * locked to the nozzle node every frame below, so this only ever paints the
 * initial commit — and the material starts at `opacity: 0`, so it is never seen.
 */
const DEFAULT_NOZZLE: [number, number, number] = [0, 1.05, 0.17];

/**
 * The cone the mist is scattered through: from the nozzle **towards the camera**,
 * with a slight upward arc.
 *
 * `+Z` is the important part. The vessel's yaw is trimmed so the spout lands on
 * world `+Z` — straight at the viewer (see `NOZZLE_YAW` in `BottleGltf`) — so the
 * plume has to fire the same way, or the mist leaves the bottle sideways. There is
 * no `X` component because the yaw trim already took the spout's sideways lean out;
 * adding one back here would only push the plume off the spout again.
 */
const PLUME = { axis: [0, 0.12, 0.99], reach: 1.35, spread: 0.38 } as const;

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
 * Creates an alpha-only atomized droplet map. The particle material supplies the
 * live fragrance tint, so the same plume can follow every variant color.
 */
function createDroplet(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // White RGB keeps the texture neutral; its alpha still defines the dense core
  // and feathered rim while pointsMaterial applies the fragrance color.
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.8)");
  gradient.addColorStop(0.65, "rgba(255, 255, 255, 0.35)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new CanvasTexture(canvas);
}

/** Droplet positions: fine atomized particles scattered through the cone plume. */
function createPlume(): Float32Array {
  const axis = new Vector3(...PLUME.axis).normalize();
  // Built off +Y, not +Z. The plume now fires along +Z, and a cross product with
  // its own direction is degenerate — the spread basis would collapse and the
  // cone would come out as a line.
  const across = new Vector3(0, 1, 0).cross(axis).normalize();
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
  const tempVec = useMemo(() => new Vector3(), []);
  const { mist, mistMaterial } = refs;

  // Dynamically lock the mist origin to the exact 3D nozzle orifice node
  useFrame(() => {
    const nozzle = refs.nozzle?.current;
    const tiltGroup = refs.tiltGroup?.current;
    const mistObj = mist.current;
    if (nozzle && tiltGroup && mistObj) {
      nozzle.getWorldPosition(tempVec);
      tiltGroup.worldToLocal(tempVec);
      mistObj.position.copy(tempVec);
    }
  });

  return (
    <points
      ref={mist}
      position={DEFAULT_NOZZLE}
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
