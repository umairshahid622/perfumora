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
  /** Gravitational acceleration in scene units per second squared. Strong enough to
   *  bring a droplet back below the orifice within its own lifetime — the arc has to
   *  *complete*, otherwise the plume only ever rises and the "then falls" half of the
   *  gesture never happens. */
  gravity: 2.4,
  /** Viscous aerodynamic drag coefficient (s^-1). Eased well down from the earlier
   *  2.8: that much drag capped the plume's travel short, and lengthening the spray
   *  by raising velocity alone just threw the apex higher. Lower drag lets droplets
   *  carry, and it is half of why the projection roughly doubled. */
  drag: 0.55,
  /** Mean droplet ejection velocity from pump orifice (units/s). Paired with `drag`
   *  to set the plume's reach — terminal displacement is velocity / drag — so this
   *  is raised to lengthen the spray while drag keeps it soft. */
  exitVelocity: 6.5,
  /** Launch angle from the orifice, in radians. **Negative** — aimed a few degrees
   *  downward — and deliberately so. The cone's upper edge launches at
   *  `elevation + coneAngle`, so with a level axis that edge still leaves at the full
   *  cone half-angle and the cloud's p95 apex reached 0.40 units: a visible climbing
   *  jet rather than a settling haze. Tilting the axis down until that upper edge is
   *  near level flattens the whole cloud (p95 apex 0.20, under a tenth of the
   *  bottle's height) while gravity settles the rest — 96% of droplets finish below
   *  the nozzle. A real atomizer's plume is broadly horizontal and *settles*; it does
   *  not climb. */
  elevationAngle: -0.20,
  /** Lateral angle aligned straight with nozzle (0.0 = straight forward out of orifice) */
  lateralAngle: 0.0,
  /** Conical spray dispersion half-angle (~30°). Deliberately wide relative to the
   *  plume's length: the ratio of spread to reach is what reads as a diffuse mist
   *  rather than a dense rope of droplets. */
  coneAngle: 0.52,
  /** Duration of active nozzle ejection burst across pump stroke (seconds) */
  burstDuration: 0.48,
  /** Individual droplet evaporation/fade lifetime (seconds). Held a touch longer than
   *  the rise so the downward half of the arc is still on screen when the droplet
   *  fades — the whole point of the gesture is the fall. */
  particleLifetime: 0.90,
  /** Total number of simulated mist droplets. Fewer than the dense pass, offset by
   *  a far wider cone: the cloud's *density per unit volume* is what made it look
   *  like a solid object, and spreading the same droplets over more space is a
   *  cleaner fix than shrinking them alone. */
  count: 1100,
  /** Base droplet size factor in projection units (fine 1.5-5px atomized droplets) */
  dotSize: 0.042,
  /** Peak global mist opacity. The Ritual plays over the light parchment ground and
   *  the plume is seen in three-quarter view, so the droplets stay readable at well
   *  under full opacity — a dense cloud here reads as a heavy lump rather than a
   *  fragrance haze. */
  peakOpacity: 0.55,
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

  // 3D nozzle trajectory axis: out of the orifice toward the viewer, tilted up by
  // the elevation angle. The upward component is the whole point — it is what
  // gravity spends the droplet's lifetime arcing back down, and without it there
  // is no ballistic trajectory, only a sinking jet.
  const axis = new Vector3(
    0.0,
    Math.sin(MIST_PHYSICS.elevationAngle),
    Math.cos(MIST_PHYSICS.elevationAngle),
  ).normalize();

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
    // Amplitude is deliberately comparable to the plume's own spread — it is what
    // breaks the coherent beam apart into drifting wisps.
    turbulence[i * 4] = 3.2 + Math.random() * 3.5;
    turbulence[i * 4 + 1] = 0.05 + Math.random() * 0.06;
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
    // Same object as the material's own `uniforms` for this component's whole
    // life — `BottleMist` creates the memo once specifically so this can be relied
    // on — so writing through here is writing to what the shader renders with.
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
        Math.sin(Math.min(1, Math.max(0, tauNorm)) * Math.PI) *
        MIST_PHYSICS.peakOpacity;
      opacity = Math.max(opacity, autoOpacity);
    }
    if ((mistObj.userData?.sprayTime ?? 0) > 0 && opacity <= 0) {
      opacity = MIST_PHYSICS.peakOpacity;
    }
    currentUniforms.uGlobalOpacity.value = opacity;

    // 5. High-DPI point size normalization
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    currentUniforms.uPixelRatio.value = dpr;
  });
}
