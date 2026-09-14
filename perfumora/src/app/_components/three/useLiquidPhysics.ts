"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector2, Vector3 } from "three";
import type { BottleRefs } from "./useBottleRefs";

export interface LiquidUniforms {
  uSlosh: { value: Vector2 };
  uWaveTime: { value: number };
  uWaveIntensity: { value: number };
}

/**
 * Creates the initial uniform object shared between the shader and physics hook.
 */
export function createLiquidUniforms(): LiquidUniforms {
  return {
    uSlosh: { value: new Vector2(0, 0) },
    uWaveTime: { value: 0 },
    uWaveIntensity: { value: 0 },
  };
}

/** Physics tuning parameters */
const STIFFNESS = 10.0; // Natural harmonic return rate (~0.5 Hz slosh frequency)
const DAMPING = 4.4; // Optimal damping ratio (zeta ~0.70) for fluid slosh oscillation without shivering
const INERTIA_STRENGTH = 0.22; // Silky gentle kick from bottle rotational acceleration
const SCROLL_INERTIA = 0.045; // Dynamic fluid slosh impulse driven by scroll velocity
const POINTER_INERTIA = 0.004; // Micro-kick from mouse movement (eliminating any pointer tremor)
const MAX_SLOSH = 0.20; // Safe maximum tilt in radians (~11.5 deg) to prevent glass clipping

/**
 * Real-time 2D damped harmonic oscillator for fluid slosh physics in the perfume bottle.
 * Drives vertex displacement and surface wave ripples in the liquid shader.
 */
export function useLiquidPhysics(
  refs: BottleRefs,
  uniformsRef: React.RefObject<LiquidUniforms | null>,
) {
  // Physical state vectors: X and Z axes
  const slosh = useRef({ x: 0, z: 0 });
  const velocity = useRef({ x: 0, z: 0 });
  const smoothedImpulse = useRef({ x: 0, z: 0 });
  const waveTime = useRef(0);

  // Previous frame tracking for angular velocity & scroll velocity
  const prevUp = useRef<Vector3 | null>(null);
  const prevForward = useRef<Vector3 | null>(null);
  const prevPointer = useRef<Vector2 | null>(null);
  const prevScrollY = useRef<number | null>(null);
  const currentQuat = useRef(new Quaternion());
  const bottleUp = useRef(new Vector3(0, 1, 0));
  const bottleForward = useRef(new Vector3(0, 0, 1));
  const invQuat = useRef(new Quaternion());
  const localPrevForward = useRef(new Vector3());

  useFrame((state, delta) => {
    const uniforms = uniformsRef.current;
    const liquidMesh = refs.liquid.current;
    if (!uniforms || !liquidMesh) return;

    // Clamp delta to avoid physics instability on tab switch or frame drop
    const dt = Math.min(delta, 0.05);

    // Compute current world orientation of the bottle
    liquidMesh.getWorldQuaternion(currentQuat.current);
    bottleUp.current.set(0, 1, 0).applyQuaternion(currentQuat.current);
    bottleForward.current.set(0, 0, 1).applyQuaternion(currentQuat.current);

    // Liquid in local space counter-tilts against world tilt to stay level with gravity
    const targetSloshX = -bottleUp.current.x * 0.90;
    const targetSloshZ = -bottleUp.current.z * 0.90;

    // Calculate angular velocity (rate of tilt change from scroll or variant spin)
    let impulseX = 0;
    let impulseZ = 0;
    let omegaY = 0;

    if (prevUp.current && prevForward.current) {
      // Tilt rate of change
      const dUpX = (bottleUp.current.x - prevUp.current.x) / dt;
      const dUpZ = (bottleUp.current.z - prevUp.current.z) / dt;
      impulseX = -dUpX * INERTIA_STRENGTH;
      impulseZ = -dUpZ * INERTIA_STRENGTH;

      // Spin rate of change around local Y axis (e.g. variant change spin)
      invQuat.current.copy(currentQuat.current).invert();
      localPrevForward.current
        .copy(prevForward.current)
        .applyQuaternion(invQuat.current);
      // Local x displacement of the previous forward vector gives -dTheta
      omegaY = -localPrevForward.current.x / dt;
      // Rotational inertia kicks fluid along local X axis and diagonal
      impulseX += -omegaY * 0.015;
      impulseZ += Math.abs(omegaY) * 0.006;
    } else {
      prevUp.current = new Vector3();
      prevForward.current = new Vector3();
    }
    prevUp.current.copy(bottleUp.current);
    prevForward.current.copy(bottleForward.current);

    // Dynamic scroll velocity tracking: liquid oscillation scales directly with scroll speed
    let scrollVel = 0;
    if (typeof window !== "undefined") {
      const lenis = (window as unknown as { lenis?: { velocity?: number } }).lenis;
      if (lenis && typeof lenis.velocity === "number") {
        scrollVel = lenis.velocity;
      } else if (prevScrollY.current !== null) {
        // Native scroll velocity fallback scaled to match Lenis velocity magnitude
        scrollVel = ((window.scrollY - prevScrollY.current) / dt) * 0.05;
      }
      prevScrollY.current = window.scrollY;
    }

    // Inject scroll speed impulse into fluid oscillator (pitch Z-axis + tilt-coupled lateral X-axis)
    const scrollImpulseZ = Math.max(-1.8, Math.min(1.8, -scrollVel * SCROLL_INERTIA));
    const scrollImpulseX = Math.max(
      -0.8,
      Math.min(0.8, -scrollVel * SCROLL_INERTIA * (bottleUp.current.x * 0.6 + 0.12)),
    );
    impulseZ += scrollImpulseZ;
    impulseX += scrollImpulseX;

    // Subtle interactive pointer movement slosh with smoothed delta
    if (state.pointer) {
      if (prevPointer.current) {
        const dpx = (state.pointer.x - prevPointer.current.x) / dt;
        const dpy = (state.pointer.y - prevPointer.current.y) / dt;
        impulseX += -dpx * POINTER_INERTIA;
        impulseZ += dpy * POINTER_INERTIA;
      } else {
        prevPointer.current = new Vector2();
      }
      prevPointer.current.copy(state.pointer);
    }

    // Exponential low-pass filter on impulse inputs to eliminate finite-difference spikes and shivering
    smoothedImpulse.current.x += (impulseX - smoothedImpulse.current.x) * Math.min(1, dt * 10);
    smoothedImpulse.current.z += (impulseZ - smoothedImpulse.current.z) * Math.min(1, dt * 10);

    // 2D Damped Harmonic Oscillator (Hooke's law + viscous drag + smoothed impulse)
    const accelX =
      STIFFNESS * (targetSloshX - slosh.current.x) -
      DAMPING * velocity.current.x +
      smoothedImpulse.current.x;
    const accelZ =
      STIFFNESS * (targetSloshZ - slosh.current.z) -
      DAMPING * velocity.current.z +
      smoothedImpulse.current.z;

    velocity.current.x += accelX * dt;
    velocity.current.z += accelZ * dt;

    // Clamp velocity to prevent sudden shockwaves
    velocity.current.x = Math.max(-1.5, Math.min(1.5, velocity.current.x));
    velocity.current.z = Math.max(-1.5, Math.min(1.5, velocity.current.z));

    slosh.current.x += velocity.current.x * dt;
    slosh.current.z += velocity.current.z * dt;

    // Clamp slosh within safe aesthetic bounds
    slosh.current.x = Math.max(-MAX_SLOSH, Math.min(MAX_SLOSH, slosh.current.x));
    slosh.current.z = Math.max(-MAX_SLOSH, Math.min(MAX_SLOSH, slosh.current.z));

    waveTime.current += dt * 2.0;

    // Write to shader uniforms
    uniforms.uSlosh.value.set(slosh.current.x, slosh.current.z);
    uniforms.uWaveTime.value = waveTime.current;
    // Keep wave intensity zeroed to prevent high-frequency surface shivering
    uniforms.uWaveIntensity.value = 0;
  });
}
