"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Quaternion, Vector3, type IUniform } from "three";
import type { BottleRefs } from "./useBottleRefs";
import { SPRAY_RESET_EVENT, SPRAY_START_EVENT } from "./useBottleUncap";

/**
 * Aerodynamic & Gravitational physics parameters for atomized perfume mist.
 *
 * Modeled after real-world high-pressure aerosol atomization:
 * - High initial ejection velocity along nozzle trajectory
 * - Viscous air drag dampening forward momentum exponentially: v(t) = v0 * exp(-drag * t)
 * - Continuous downward gravitational acceleration: a = -g
 * - Ballistic projectile trajectory curving downward from nozzle apex
 * - Continuous droplet emission window over the pump stroke
 */
export const MIST_PHYSICS = {
  /** Gravitational acceleration in scene units per second squared (gentle natural downward droop) */
  gravity: 1.4,
  /** Viscous aerodynamic drag coefficient (s^-1) */
  drag: 2.2,
  /** Mean droplet ejection velocity from pump orifice (units/s) */
  exitVelocity: 2.4,
  /** Level horizontal launch from nozzle level (0.0 = straight horizontal, no upward rise) */
  elevationAngle: 0.0,
  /** Lateral angle aligned straight with nozzle (0.0 = straight forward out of orifice) */
  lateralAngle: 0.0,
  /** Conical spray dispersion half-angle (~16°) */
  coneAngle: 0.28,
  /** Duration of active nozzle ejection burst across pump stroke (seconds) */
  burstDuration: 0.48,
  /** Individual droplet evaporation/fade lifetime (seconds) */
  particleLifetime: 0.90,
  /** Total number of simulated mist droplets for crisp atomization without solid clumping */
  count: 1200,
  /** Base droplet size factor in projection units (delicate 3-16px atomized droplets) */
  dotSize: 0.12,
} as const;

export interface MistBuffers {
  positions: Float32Array;
  velocities: Float32Array;
  physics: Float32Array;
  turbulence: Float32Array;
}

export interface MistUniforms {
  [uniform: string]: IUniform;
  uTime: { value: number };
  uGravity: { value: Vector3 };
  uColor: { value: Color };
  uGlobalOpacity: { value: number };
  uBaseSize: { value: number };
  uPixelRatio: { value: number };
}

/**
 * Creates initial shader uniforms for the mist projectile physics.
 */
export function createMistUniforms(color: string): MistUniforms {
  return {
    uTime: { value: 0 },
    uGravity: { value: new Vector3(0, -MIST_PHYSICS.gravity, 0) },
    uColor: { value: new Color(color) },
    uGlobalOpacity: { value: 0 },
    uBaseSize: { value: MIST_PHYSICS.dotSize },
    uPixelRatio: { value: 1.5 },
  };
}

/**
 * Generates typed attribute buffers for GPU-accelerated projectile physics.
 */
export function generateMistBuffers(count = MIST_PHYSICS.count): MistBuffers {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const physics = new Float32Array(count * 4);
  const turbulence = new Float32Array(count * 4);

  // 3D nozzle trajectory axis: shoots straight forward out of the nozzle orifice (+Z towards viewer, Y = 0)
  // Perfectly aligned with the physical spout on the pump button.
  const axis = new Vector3(0.0, 0.0, 1.0).normalize();

  // Robust orthonormal basis for conical spray dispersion
  const tempUp = new Vector3(0, 1, 0);
  const across = new Vector3().crossVectors(tempUp, axis).normalize();
  const up = new Vector3().crossVectors(axis, across).normalize();

  const dir = new Vector3();

  for (let i = 0; i < count; i++) {
    // Initial position starts at nozzle orifice (0, 0, 0)
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;

    // Conical distribution: area-uniform disk sampling
    const r = Math.sqrt(Math.random());
    const phi = Math.random() * Math.PI * 2;
    const theta = r * MIST_PHYSICS.coneAngle;

    // Droplet ejection speed: core stream droplets carry higher momentum
    const speedRatio = 1.0 - 0.28 * r + (Math.random() - 0.5) * 0.22;
    const speed = MIST_PHYSICS.exitVelocity * Math.max(0.65, speedRatio);

    // Compute 3D direction vector inside the cone
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    dir
      .copy(axis)
      .multiplyScalar(cosTheta)
      .addScaledVector(across, Math.cos(phi) * sinTheta)
      .addScaledVector(up, Math.sin(phi) * sinTheta)
      .normalize();

    // Ensure the spray comes strictly from straight to down:
    // Droplets emerge level at nozzle height or angle downward, never going high first.
    if (dir.y > 0.0) {
      dir.y = 0.0;
      dir.normalize();
    }

    velocities[i * 3] = dir.x * speed;
    velocities[i * 3 + 1] = dir.y * speed;
    velocities[i * 3 + 2] = dir.z * speed;

    // Physics attributes:
    // x: birthTime across pump stroke duration
    // y: drag coefficient with droplet size variance
    // z: relative droplet size multiplier
    // w: evaporation lifetime
    const birthTime = Math.pow(Math.random(), 1.1) * MIST_PHYSICS.burstDuration;
    const drag = MIST_PHYSICS.drag * (0.85 + Math.random() * 0.35);
    const sizeMultiplier = 0.70 + Math.random() * 0.70;
    const lifetime = MIST_PHYSICS.particleLifetime * (0.85 + Math.random() * 0.3);

    physics[i * 4] = birthTime;
    physics[i * 4 + 1] = drag;
    physics[i * 4 + 2] = sizeMultiplier;
    physics[i * 4 + 3] = lifetime;

    // Turbulence attributes for organic micro-eddies in the slowing cloud:
    // x: frequency, y: amplitude, z: phaseX, w: phaseY
    turbulence[i * 4] = 3.2 + Math.random() * 3.5;
    turbulence[i * 4 + 1] = 0.04 + Math.random() * 0.04;
    turbulence[i * 4 + 2] = Math.random() * Math.PI * 2;
    turbulence[i * 4 + 3] = Math.random() * Math.PI * 2;
  }

  return { positions, velocities, physics, turbulence };
}

/**
 * Real-time physics coordinator for Mist.
 * - Locks mist origin to the dynamic 3D nozzle orifice node.
 * - Continuously projects world-space gravity (0, -g, 0) into mist local coordinates
 *   so spray falls naturally towards the ground even when the bottle tilts.
 * - Drives simulation time and synchronizes opacity.
 */
export function useMistPhysics(
  refs: BottleRefs,
  uniforms: MistUniforms,
) {
  const uniformsRef = useRef(uniforms);
  useEffect(() => {
    uniformsRef.current = uniforms;
  }, [uniforms]);

  const tempVec = useRef(new Vector3());
  const worldGrav = useRef(new Vector3());
  const localGrav = useRef(new Vector3());
  const invQuat = useRef(new Quaternion());
  const autonomousTime = useRef<number | null>(null);

  // Standalone event listeners for autonomous spray triggers
  useEffect(() => {
    const handleSprayStart = () => {
      autonomousTime.current = 0;
    };
    const handleSprayReset = () => {
      autonomousTime.current = null;
    };

    window.addEventListener(SPRAY_START_EVENT, handleSprayStart);
    window.addEventListener(SPRAY_RESET_EVENT, handleSprayReset);
    return () => {
      window.removeEventListener(SPRAY_START_EVENT, handleSprayStart);
      window.removeEventListener(SPRAY_RESET_EVENT, handleSprayReset);
    };
  }, []);

  useFrame((state, delta) => {
    const nozzle = refs.nozzle?.current;
    const mistObj = refs.mist.current;
    const currentUniforms = uniformsRef.current;
    if (!mistObj || !currentUniforms) return;

    // 1. Lock mist origin to live nozzle orifice position in mistObj's parent space
    const parent = mistObj.parent;
    if (nozzle && parent) {
      nozzle.updateWorldMatrix(true, false);
      nozzle.getWorldPosition(tempVec.current);
      parent.worldToLocal(tempVec.current);
      // Small forward offset along +Z so droplets emerge directly at the orifice front lip
      tempVec.current.z += 0.0033;
      mistObj.position.copy(tempVec.current);
    }

    // 2. Project world gravity (0, -g, 0) into mist local space
    mistObj.getWorldQuaternion(invQuat.current).invert();
    worldGrav.current.set(0, -MIST_PHYSICS.gravity, 0);
    localGrav.current
      .copy(worldGrav.current)
      .applyQuaternion(invQuat.current);
    currentUniforms.uGravity.value.copy(localGrav.current);

    // 3. Coordinate live physical simulation time
    if (autonomousTime.current !== null) {
      const dt = Math.min(delta, 0.05);
      autonomousTime.current += dt;
      if (autonomousTime.current >= MIST_PHYSICS.burstDuration + MIST_PHYSICS.particleLifetime) {
        autonomousTime.current = null;
      }
    }

    // Pass synchronized physical time to shader uniform
    const liveTime =
      autonomousTime.current !== null
        ? autonomousTime.current
        : (mistObj.userData?.sprayTime ?? 0);
    currentUniforms.uTime.value = liveTime;

    // 4. Mirror master material opacity to shader uniform, with autonomous fallback
    const mistMat = refs.mistMaterial.current as { opacity?: number; uniforms?: MistUniforms } | null;
    let opacity = mistMat?.opacity ?? 0;
    if (autonomousTime.current !== null) {
      const totalDuration =
        MIST_PHYSICS.burstDuration + MIST_PHYSICS.particleLifetime;
      const tauNorm = autonomousTime.current / totalDuration;
      const autoOpacity =
        Math.sin(Math.min(1, Math.max(0, tauNorm)) * Math.PI) * 0.88;
      opacity = Math.max(opacity, autoOpacity);
    }
    if ((mistObj.userData?.sprayTime ?? 0) > 0 && opacity <= 0) {
      opacity = 0.88;
    }
    currentUniforms.uGlobalOpacity.value = opacity;

    // 5. High-DPI point size normalization
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    currentUniforms.uPixelRatio.value = dpr;
  });
}
