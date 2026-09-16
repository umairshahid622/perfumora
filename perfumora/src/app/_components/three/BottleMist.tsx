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

/** Maximum opacity at peak atomization. */
export const MIST_OPACITY = 0.88;

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

    // Ensure mist emerges strictly at nozzle level and curves downward under gravity
    pos.y = min(0.0, pos.y);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Point size attenuation with realistic aerosol cloud expansion
    float ageRatio = tau / lifetime;
    float expansion = 1.0 + 1.1 * smoothstep(0.0, 0.7, ageRatio);
    float pSize = uBaseSize * sizeMultiplier * expansion * (300.0 / -mvPosition.z) * uPixelRatio;
    gl_PointSize = clamp(pSize, 3.0, 16.0);

    // Smooth natural alpha envelope:
    // Rapid birth fade-in as mist emerges from orifice
    float fadeIn = smoothstep(0.0, 0.05, ageRatio);
    // Soft, velvety dissipation as droplets evaporate into ambient air
    float fadeOut = 1.0 - smoothstep(0.35, 1.0, ageRatio);
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

    // Smooth circular droplet with dense core and feathered rim
    float core = smoothstep(0.5, 0.02, dist);
    float halo = exp(-dist * 4.5);
    float finalAlpha = mix(core, halo, 0.35) * vAlpha * 0.95;

    if (finalAlpha <= 0.003) discard;

    // Rich tint contrast so atomized mist is clearly discernible against light parchment
    vec3 mistColor = mix(vec3(0.20, 0.17, 0.14), uColor, 0.50);
    gl_FragColor = vec4(mistColor, finalAlpha);
  }
`;

interface BottleMistProps {
  refs: BottleRefs;
  /** Fragrance variant tint color matching the live juice */
  color?: string;
}

export function BottleMist({ refs, color }: BottleMistProps) {
  const uniforms = useMemo(() => createMistUniforms(color ?? "#322924"), [color]);
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

  // Update perfume tint color on variant transition
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
