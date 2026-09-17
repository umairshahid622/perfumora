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

    // Point size attenuation with aerosol cloud expansion. The expansion is large
    // here, and it is half of what builds the far cloud: droplets that are still
    // growing as they arrive, on top of the turbulence that has already spread
    // them, are what turn the decelerating far end into a soft mass instead of a
    // held shape. Confined to the late half of life so the nozzle end stays a
    // finely speckled cone — the reference is discrete specks there and a smooth
    // wash at the far end, and this split is what produces both.
    float ageRatio = tau / lifetime;
    float expansion = 1.0 + 1.05 * smoothstep(0.15, 0.85, ageRatio);
    float pSize = uBaseSize * sizeMultiplier * expansion * (300.0 / -mvPosition.z) * uPixelRatio;
    gl_PointSize = clamp(pSize, 1.5, 7.0);

    // Smooth natural alpha envelope:
    // Rapid birth fade-in as mist emerges from orifice
    float fadeIn = smoothstep(0.0, 0.05, ageRatio);
    // Soft, velvety dissipation, and held late. The reference's cloud is still a
    // coherent soft mass at its furthest point, so the fade has to stay out of the
    // way until the droplets have actually arrived and gathered. Fading from a
    // sixth of life, as it used to, dissolved the cloud before it could form —
    // which is part of why the far end read as a thin rope rather than a body.
    float fadeOut = 1.0 - smoothstep(0.30, 0.95, ageRatio);
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

    // Soft circular droplet, and softer than it was: the halo now carries most of
    // the weight and reaches further, so the cloud's boundary is a gradient rather
    // than an edge. The reference's cloud is one you cannot point at the edge of —
    // that softness lives here, in the falloff, not in the physics.
    float core = smoothstep(0.5, 0.16, dist) * 0.75;
    float halo = exp(-dist * 5.2);
    float finalAlpha = mix(core, halo, 0.68) * vAlpha * 0.50;

    if (finalAlpha <= 0.003) discard;

    // Where the cloud sits against the page, and the whole reason this is a mid
    // grey rather than a pale white.
    //
    // The parchment is --paper: #f3ece0 — already 0.95 in red. A white-ish mist
    // (this was 0.87) therefore has almost nowhere to go: it can only sit ~8%
    // below the page, which is under the threshold anyone notices, and the cloud
    // reads as absent. That is the "barely visible" report. The reference manages
    // a white spray because its ground is a flat illustration; ours is a real
    // composited page at 0.95, and on it a pale cloud simply cannot be pale *and*
    // present. Contrast wins, so the mist is anchored well below the page and
    // reads as a soft warm grey haze — which is also what gives the reference's
    // cloud its volume along the shaded edge.
    //
    // Do not lighten this again to chase the reference's whiteness. If the cloud
    // needs to be more present, the peakOpacity uniform is the lever; if it needs
    // to be softer, the halo weight above is.
    vec3 mistColor = mix(vec3(0.66, 0.64, 0.61), uColor, 0.26);
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
