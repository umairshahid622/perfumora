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
  /** Gravitational acceleration in scene units per second squared. Sized against the
   *  (now much shallower) launch angle so the plume rises out of the orifice and
   *  then *settles back to about the orifice* rather than carrying on up — the
   *  cloud's centre lands near level with the nozzle, which is what the reference
   *  does and what stops the whole gesture reading as a climbing jet. */
  gravity: 1.4,
  /** Viscous aerodynamic drag coefficient (s^-1). Raised from the 0.55 that gave
   *  the old long plume: at that setting droplets barely decelerated, so the
   *  spray stayed a thin rope to the very end. This much drag makes them slow and
   *  bunch as they arrive, which is what piles the far end up into the soft cloud
   *  the reference shows, and it caps the reach at `exitVelocity / drag`. */
  drag: 1.1,
  /** Mean droplet ejection velocity from pump orifice (units/s). Sized against
   *  `drag` for the plume's reach, which has to land near 0.85 of the bottle's
   *  height *on screen* — and because the Ritual yaw foreshortens the forward
   *  travel to about half, that means a considerably longer path in local space
   *  than the screen figure suggests. */
  exitVelocity: 5.3,
  /** Launch angle from the orifice, in radians. **Dead level** — the plume leaves
   *  the nozzle flat and gravity does the rest, so the whole read is "out, then
   *  gently down" with no climb at all.
   *
   *  Zero is worth stating explicitly here because this number is *not* what the
   *  eye gets. The Ritual yaw compresses the plume's forward travel to `sin(0.55)`
   *  of its length, so the angle on screen is
   *  `atan(tan(elevation) / sin(RITUAL_YAW))` — very nearly *double*. It was 0.34
   *  (19.5° local) and presented as 34°, which is the "going too much upwards"
   *  report; 0.13 presented at ~14° and still read as a drift. Anything above
   *  ~0.20 local starts to look like a jet. Level is the floor of that scale, and
   *  the yaw multiplier is what to keep in mind if it ever moves back up.
   *
   *  Note the plume still settles: `gravity` takes the cloud below the orifice over
   *  the flight, so this is level *leaving*, not level *arriving*. */
  elevationAngle: 0.0,
  /** Lateral angle aligned straight with nozzle (0.0 = straight forward out of orifice) */
  lateralAngle: 0.0,
  /** Conical spray dispersion half-angle (~15°). Deliberately *tight*, and the
   *  opposite of the earlier wide fan: the reference leaves the nozzle as a narrow
   *  speckled cone and only balloons later. That ballooning is the turbulence
   *  below plus the age-driven sprite growth, not the launch angle — a wide cone
   *  here would make the nozzle end fat and the cloud no bigger. */
  coneAngle: 0.31,
  /** Duration of active nozzle ejection burst across pump stroke (seconds) */
  burstDuration: 0.46,
  /** Individual droplet evaporation/fade lifetime (seconds). Long enough that the
   *  far cloud is still on screen while it is still growing into its final soft
   *  mass, rather than dissolving the moment it arrives. */
  particleLifetime: 0.92,
  /** Total number of simulated mist droplets. Raised: the reference's far cloud is
   *  a smooth wash, and smoothness there is particle count, not opacity — the same
   *  droplets over a wider cloud is what keeps it a veil rather than a lump. */
  count: 1500,
  /** Base droplet size factor in projection units. Raised back up from 0.038: the
   *  reference is fine atomization, but fine is only readable when there is
   *  contrast to read it with, and this was shrunk in the same pass that paled the
   *  colour — two reductions in visibility at once, which is what produced the
   *  "barely visible" report. */
  dotSize: 0.045,
  /** Peak global mist opacity. Carries visibility now that the colour has been
   *  taken back down to a mid warm grey: against the `--paper: #f3ece0` ground a
   *  pale cloud cannot read by hue alone, so density has to do it. Lower this
   *  first if the cloud ever looks heavy again — it is the softer of the two
   *  visibility levers. */
  peakOpacity: 0.58,
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

  // 3D nozzle trajectory axis: straight out of the orifice along the nozzle's own
  // forward (+Z), level. The elevation term is kept rather than baked out so the
  // launch angle stays a single knob — and at 0 it is well-behaved: the axis is
  // (0, 0, 1), so `across` comes out pure X and `up` pure Y below, with no
  // degenerate cross product.
  //
  // This is level *launch*, not a level plume. The cone's upper half still throws
  // droplets above the axis and gravity brings the cloud back down over the flight,
  // so the settle now comes entirely from those two instead of from a tilted axis.
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
    //
    // The amplitude is what *balloons* the plume. It is scaled by `oneMinusExp` in
    // the shader, so a droplet scatters barely at all as it leaves the orifice and
    // most as it arrives — which is exactly the reference's read: a tight speckled
    // cone that opens out into a broad soft cloud only at the far end. Raising it
    // is therefore how the cloud is grown, and it has to be done here rather than
    // with `coneAngle`, which would fatten the nozzle end instead. Kept random per
    // droplet so the cloud has no repeating structure.
    turbulence[i * 4] = 3.2 + Math.random() * 3.5;
    turbulence[i * 4 + 1] = 0.28 + Math.random() * 0.26;
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
