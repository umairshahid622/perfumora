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
const STIFFNESS = 22.0; // Spring return rate (natural harmonic frequency)
const DAMPING = 3.6; // Viscous damping (settles in ~0.7s)
const INERTIA_STRENGTH = 0.50; // Kick from bottle rotational acceleration
const POINTER_INERTIA = 0.08; // Subtle kick from mouse movement
const MAX_SLOSH = 0.22; // Safe maximum tilt in radians (~12.5 deg) to prevent glass clipping

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
  const waveTime = useRef(0);

  // Previous frame tracking for angular velocity
  const prevUp = useRef<Vector3 | null>(null);
  const prevForward = useRef<Vector3 | null>(null);
  const prevPointer = useRef<Vector2 | null>(null);
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
      impulseX += -omegaY * 0.018;
      impulseZ += Math.abs(omegaY) * 0.008;
    } else {
      prevUp.current = new Vector3();
      prevForward.current = new Vector3();
    }
    prevUp.current.copy(bottleUp.current);
    prevForward.current.copy(bottleForward.current);

    // Subtle interactive pointer movement slosh
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

    // 2D Damped Harmonic Oscillator (Hooke's law + viscous drag + inertia impulse)
    const accelX =
      STIFFNESS * (targetSloshX - slosh.current.x) -
      DAMPING * velocity.current.x +
      impulseX;
    const accelZ =
      STIFFNESS * (targetSloshZ - slosh.current.z) -
      DAMPING * velocity.current.z +
      impulseZ;

    velocity.current.x += accelX * dt;
    velocity.current.z += accelZ * dt;

    slosh.current.x += velocity.current.x * dt;
    slosh.current.z += velocity.current.z * dt;

    // Clamp slosh within safe aesthetic bounds
    slosh.current.x = Math.max(-MAX_SLOSH, Math.min(MAX_SLOSH, slosh.current.x));
    slosh.current.z = Math.max(-MAX_SLOSH, Math.min(MAX_SLOSH, slosh.current.z));

    // Dynamic wave ripples active when liquid is sloshing
    const speed =
      Math.abs(velocity.current.x) + Math.abs(velocity.current.z);
    const targetIntensity = Math.min(0.02, speed * 0.05);
    
    waveTime.current += dt * (3.0 + speed * 6.0);

    // Write to shader uniforms
    uniforms.uSlosh.value.set(slosh.current.x, slosh.current.z);
    uniforms.uWaveTime.value = waveTime.current;
    // Smooth damp wave intensity
    uniforms.uWaveIntensity.value +=
      (targetIntensity - uniforms.uWaveIntensity.value) * Math.min(1, dt * 10);
  });
}
