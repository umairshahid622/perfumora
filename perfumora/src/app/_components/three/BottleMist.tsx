"use client";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  type ShaderMaterial,
  type Object3D,
} from "three";
import type { BottleRefs } from "./useBottleRefs";
import {
  MIST_PHYSICS,
  createMistUniforms,
  generateMistBuffers,
  useMistPhysics,
} from "./useMistPhysics";

/**
 * Initial fallback origin before the first frame runs.
 * Anchored dynamically to refs.nozzle orifice every frame.
 */
const DEFAULT_NOZZLE: [number, number, number] = [0, 1.0504, 0.174];

/** Maximum opacity at peak atomization. Mirrors the physics profile so the GSAP
 *  fade on the scroll-driven path and the autonomous fallback in
 *  `useMistPhysics` can neither disagree with each other nor drift from the value
 *  the tuning in `MIST_PHYSICS` settled on. */
export const MIST_OPACITY = MIST_PHYSICS.peakOpacity;

/** Retained for backwards compatibility. */
export const MIST_COLLAPSED = 0.04;

const RENDER_ORDER = 3;

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uGravity;
  uniform float uGlobalOpacity;
  uniform float uBaseSize;
  uniform float uPixelRatio;

  attribute vec3 aVelocity;
  attribute vec4 aPhysics;    // x: birthTime, y: drag, z: sizeMultiplier, w: lifetime
  attribute vec4 aTurbulence; // x: freq, y: amp, z: phaseX, w: phaseY

  varying float vAlpha;

  void main() {
    float birthTime = aPhysics.x;
    float drag = aPhysics.y;
    float sizeMultiplier = aPhysics.z;
    float lifetime = aPhysics.w;

    float tau = uTime - birthTime;

    // Particle not yet emitted or already evaporated
    if (tau <= 0.0 || tau >= lifetime) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    // Exact Newtonian projectile kinematics with viscous air drag & gravity:
    // Forward / lateral velocity decays: v(t) = v0 * exp(-drag * t)
    // Trajectory displacement: x(t) = (v0 / drag) * (1.0 - exp(-drag * t))
    // Downward gravity displacement: y_grav(t) = (g / drag) * (t - (1.0 - exp(-drag * t)) / drag)
    float expFactor = exp(-drag * tau);
    float oneMinusExp = 1.0 - expFactor;

    // Dragged initial velocity path along nozzle firing vector
    vec3 pos = (aVelocity / drag) * oneMinusExp;

    // Ballistic parabolic curvature due to gravity
    pos += (uGravity / drag) * (tau - oneMinusExp / drag);

    // Aerodynamic micro-eddies and thermal turbulence
    float turbAmp = aTurbulence.y * oneMinusExp;
    pos.x += sin(tau * aTurbulence.x + aTurbulence.z) * turbAmp;
    pos.y += cos(tau * aTurbulence.x + aTurbulence.w) * (turbAmp * 0.5);
    pos.z += sin(tau * aTurbulence.x * 1.3 + aTurbulence.z + 1.57) * (turbAmp * 0.4);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Point size attenuation with aerosol cloud expansion. The expansion is small:
    // a droplet that doubles in size as it ages is what makes a mist look like it is
    // condensing into a solid mass, so it only widens by half before it evaporates.
    float ageRatio = tau / lifetime;
    float expansion = 1.0 + 0.55 * smoothstep(0.0, 0.7, ageRatio);
    float pSize = uBaseSize * sizeMultiplier * expansion * (300.0 / -mvPosition.z) * uPixelRatio;
    gl_PointSize = clamp(pSize, 1.5, 5.0);

    // Smooth natural alpha envelope:
    // Rapid birth fade-in as mist emerges from orifice
    float fadeIn = smoothstep(0.0, 0.05, ageRatio);
    // Soft, velvety dissipation. Kicks in earlier than the end of the lifetime, so
    // droplets thin out while they still hang instead of holding full density right
    // up to an abrupt disappearance — the accumulated cloud stays gossamer.
    float fadeOut = 1.0 - smoothstep(0.16, 0.8, ageRatio);
    vAlpha = fadeIn * fadeOut * uGlobalOpacity;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;

  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.003) discard;

    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    // Soft circular droplet. The core is deliberately not allowed to reach full
    // opacity and the halo carries most of the weight: a dense disc with a hard
    // edge is what stacks up across a thousand neighbours into a solid blob,
    // whereas a faint soft disc accumulates into a translucent haze.
    float core = smoothstep(0.5, 0.14, dist) * 0.85;
    float halo = exp(-dist * 6.5);
    float finalAlpha = mix(core, halo, 0.55) * vAlpha * 0.42;

    if (finalAlpha <= 0.003) discard;

    // Tint contrast so atomized mist is discernible against the light parchment
    // ground the Ritual plays over. Alpha carries the delicacy, so the colour can
    // stay deep enough to read without the cloud looking like a heavy solid.
    vec3 mistColor = mix(vec3(0.24, 0.21, 0.18), uColor, 0.55);
    gl_FragColor = vec4(mistColor, finalAlpha);
  }
`;

interface BottleMistProps {
  refs: BottleRefs;
  /** Fragrance variant tint color matching the live juice */
  color?: string;
}

export function BottleMist({ refs, color }: BottleMistProps) {
  // Created once and kept for the component's whole life, on purpose.
  //
  // R3F does not hand a `ShaderMaterial` the `uniforms` object a prop carries.
  // `applyProps` *merges* it into the one the material already holds, copying each
  // fresh value into a stable target ("ShaderMaterial uniforms must keep a stable
  // target reference"), and only the `onUpdate` shunt below re-points the material
  // at the new object afterwards. The per-frame writer in `useMistPhysics` holds
  // this same object, so the two are only ever agreed while there is exactly one.
  //
  // Recreating it on `color` broke that, and in the way that stays hidden. The
  // merge copies the new object's defaults in — `uGlobalOpacity` and `uTime` both
  // 0 — and the shunt is then the single thing keeping the writer and the renderer
  // pointed at the same object. It is not guaranteed to run: `invalidateInstance`
  // returns early while the instance has no parent. On the paths where it did not,
  // the material kept rendering with the object the writer had stopped updating, so
  // `uGlobalOpacity` stayed at 0 and every spray after that was invisible. That is
  // the reported bug — the mist only ever showed from a fresh load, because only a
  // variant change ever created a second uniforms object.
  //
  // The tint is applied by the effect below, so keeping this identity fixed costs
  // nothing. If it ever depends on `color` again, the shunt becomes load-bearing
  // rather than belt-and-braces — see the note on it.
  const uniforms = useMemo(() => createMistUniforms("#322924"), []);
  const buffers = useMemo(() => generateMistBuffers(MIST_PHYSICS.count), []);

  // Construct Three.js BufferGeometry imperatively to guarantee attributes mapping
  const geometry = useMemo(() => {
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(buffers.positions, 3));
    geom.setAttribute("aVelocity", new BufferAttribute(buffers.velocities, 3));
    geom.setAttribute("aPhysics", new BufferAttribute(buffers.physics, 4));
    geom.setAttribute("aTurbulence", new BufferAttribute(buffers.turbulence, 4));
    return geom;
  }, [buffers]);

  // The whole of the variant transition, as far as the mist is concerned: the
  // uniforms object above is fixed for life, so the tint travels through this one
  // `set` rather than through a new object.
  useEffect(() => {
    uniforms.uColor.value.set(color ?? "#322924");
  }, [color, uniforms]);

  // Real-time physics simulation loop
  useMistPhysics(refs, uniforms);

  return (
    <points
      ref={(node) => {
        // eslint-disable-next-line react-hooks/immutability
        (refs.mist as { current: Object3D | null }).current = node;
      }}
      geometry={geometry}
      position={DEFAULT_NOZZLE}
      scale={[1, 1, 1]}
      renderOrder={RENDER_ORDER}
    >
      <shaderMaterial
        ref={(node) => {
          // eslint-disable-next-line react-hooks/immutability
          (refs.mistMaterial as { current: ShaderMaterial | null }).current = node;
        }}
        // Needed at mount, not afterwards. R3F's first `applyProps` merges these
        // uniforms into the material as *copies* (`{ ...uniform }` per entry), so
        // without this the writer above would be updating objects the material
        // never reads. Once the material holds the real object it keeps it: with a
        // stable identity the props never diff as changed, so this stops firing and
        // nothing down this path runs on a variant change.
        onUpdate={(mat) => {
          mat.uniforms = uniforms;
        }}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        opacity={0}
      />
    </points>
  );
}
