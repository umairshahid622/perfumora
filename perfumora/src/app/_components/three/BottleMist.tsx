"use client";

import { useMemo } from "react";
import { CanvasTexture, Vector3 } from "three";
import type { BottleRefs } from "./useBottleRefs";

/**
 * Where the plume starts, in the framed model space `BottleGltf` establishes —
 * the same space `REST` poses the assembly in, so these are the units the
 * bottle's own parts are measured in (2.4 tall, centred on the origin).
 *
 * Read off the glTF: the pump's press button occupies y 0.872 → 1.107 and
 * reaches x +0.17 at its widest, so this sits just clear of its top face and a
 * little toward the camera, where a nozzle would be. It and the two numbers
 * below are the knobs to tune on a real screen — the model does not name the
 * orifice, so its exact place is a judgement, not a measurement.
 */
const NOZZLE: [number, number, number] = [0.05, 1.12, 0.08];

/**
 * The cone the mist is scattered through, again in framed units: `axis` is the
 * direction it travels (up and to the viewer's right, so the plume reads as an
 * arc on a straight-on elevation rather than a blob coming at the lens),
 * `reach` how far the far end sits from the nozzle, `spread` the cone's radius
 * once it gets there.
 */
const PLUME = { axis: [0.5, 0.82, 0.16], reach: 0.9, spread: 0.34 } as const;

/** Droplets. Enough to read as a mist, few enough to stay a mist. */
const COUNT = 90;

/**
 * Droplet diameter in *world* units — three sizes points from the material
 * alone, so this is unaffected by the assembly's rest scale or by the cloud's
 * own expansion. ~5px against the scene's 3.06-unit frame.
 */
const DOT_SIZE = 0.02;

/** Opacity at the peak of the spray; the timeline fades from and back to 0. */
export const MIST_OPACITY = 0.7;

/**
 * How small the cloud starts. It is scaled from here out to 1 about its own
 * origin — which is the nozzle — so the droplets travel *away* from the spout
 * instead of appearing spread out. GSAP only ever writes the 1, and records
 * this as the value to come back to on the way up.
 */
const COLLAPSED = 0.18;

/**
 * Past the glass's 2 in `BottleGltf`'s `RENDER_ORDER` — three sorts the
 * transparent pass on `renderOrder` before depth, and both surfaces have
 * `depthWrite` off, so without this the bottle wall could be laid down over
 * droplets in front of it. Depth *testing* is still on, so the opaque closure
 * hides the droplets genuinely behind it whatever this says.
 */
const RENDER_ORDER = 3;

/**
 * A soft round droplet, drawn once into a canvas. Points render as hard squares
 * without a map, which reads as digital noise rather than atomised liquid; the
 * gradient is pure white so the material's own colour is what tints it.
 */
function createDroplet(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new CanvasTexture(canvas);
}

/** Droplet positions: `COUNT` points scattered through the `PLUME` cone. */
function createPlume(): Float32Array {
  const axis = new Vector3(...PLUME.axis).normalize();
  // Two directions square to the axis, to place a droplet off it. The axis is a
  // constant well clear of Y, so this cross product cannot degenerate.
  const across = new Vector3(0, 1, 0).cross(axis).normalize();
  const up = axis.clone().cross(across);

  const positions = new Float32Array(COUNT * 3);
  const point = new Vector3();

  for (let i = 0; i < COUNT; i++) {
    // Biased toward the far end, so the cloud thins away from the nozzle
    // instead of clumping on it, and the cone opens as it travels (`× travel`).
    const travel = Math.sqrt(Math.random());
    const spin = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * PLUME.spread * travel;

    point
      .copy(axis)
      .multiplyScalar(travel * PLUME.reach)
      .addScaledVector(across, Math.cos(spin) * radius)
      .addScaledVector(up, Math.sin(spin) * radius);
    point.toArray(positions, i * 3);
  }

  return positions;
}

interface BottleMistProps {
  refs: BottleRefs;
  /** The fragrance's colour — the spray is the scent, so it carries its tint. */
  color: string;
}

/**
 * The spray (§6.3): a cloud of droplets parked at the pump's nozzle, invisible
 * until the Ritual's choreography fires it (see `useBottleUncap`).
 *
 * Scenery rather than product, so it is a sibling of the model instead of part
 * of it — which also keeps it out of the variant-change spin that turns
 * `refs.root`. Sitting in the same parent it shares the model's framed space,
 * which is why every constant above can be quoted against the bottle's own
 * measurements.
 *
 * No animation lives here (§5): the geometry, the material and the resting
 * state are declared, and `refs.mist` / `refs.mistMaterial` are the handles a
 * GSAP timeline expands and fades. Geometry and attribute are declared as JSX
 * so R3F owns their disposal.
 */
export function BottleMist({ refs, color }: BottleMistProps) {
  const positions = useMemo(() => createPlume(), []);
  const droplet = useMemo(() => createDroplet(), []);
  // Pulled out of `refs` before the JSX: handing `refs.mist` straight to a `ref`
  // prop reads to the hooks lint as a ref being dereferenced mid-render (the same
  // false positive `BottleGltf` carries on its own `ref={refs.root}`), and naming
  // them here is what the two handles are anyway.
  const { mist, mistMaterial } = refs;

  return (
    <points
      ref={mist}
      position={NOZZLE}
      scale={COLLAPSED}
      renderOrder={RENDER_ORDER}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      {/* `depthWrite` off for the reason the fragrance has it off: this blends,
          and a transparent surface that writes depth hides whatever is drawn
          after it — here the glass and the cap the mist passes in front of. */}
      <pointsMaterial
        ref={mistMaterial}
        color={color}
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
