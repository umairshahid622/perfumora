"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  InstancedMesh,
  MeshPhysicalMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import type { LiquidUniforms } from "./useLiquidPhysics";
import { getFragranceLiquidColor } from "./BottleGltf";

interface OilBubblesProps {
  uniforms: LiquidUniforms;
  liquidColor?: string;
  count?: number;
}

interface BubbleData {
  baseR: number;
  currentR: number;
  theta: number;
  y: number;
  vy: number;
  scale: number;
  phase: number;
  wobbleSpeed: number;
  seed: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

const BUBBLE_COUNT = 54;
const LIQUID_BOTTOM = -1.14;
const LIQUID_TOP = 0.65;
const MIN_RADIUS = 0.16; // Safely clears the central dip tube (r ~ 0.08)
const MAX_RADIUS = 0.95; // Safely clears the outer glass flacon walls (r ~ 1.134)

export function OilBubbles({
  uniforms,
  liquidColor,
  count = BUBBLE_COUNT,
}: OilBubblesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const currentColor = useRef(new Color(0xffffff));
  const targetColor = useRef(new Color(0xffffff));

  // Fluid aeration energy: 0 on static rest (bubbles completely hidden),
  // charges up to 1.0 during liquid displacement/spins, then slowly dissolves
  const aerationEnergy = useRef(0);

  // Shared sphere geometry for all instanced oil beads
  const geometry = useMemo(() => new SphereGeometry(1, 16, 16), []);

  // Pre-seed pseudo-random organic distribution of bubbles
  const bubbles = useMemo<BubbleData[]>(() => {
    const list: BubbleData[] = [];
    for (let i = 0; i < count; i++) {
      // Stratified random radii avoiding the dip tube and glass boundary
      const rRatio = Math.sqrt(0.04 + Math.random() * 0.88);
      const baseR = MIN_RADIUS + rRatio * (MAX_RADIUS - MIN_RADIUS);
      const theta = Math.random() * Math.PI * 2;
      const y = LIQUID_BOTTOM + Math.random() * (LIQUID_TOP - LIQUID_BOTTOM);

      // Hierarchical size distribution:
      // 70% micro-bubbles (radius 0.016 - 0.028),
      // 20% medium concentration beads (radius 0.032 - 0.046),
      // 10% hero oil droplets (radius 0.052 - 0.072)
      const roll = Math.random();
      let scale: number;
      if (roll < 0.70) {
        scale = 0.016 + Math.random() * 0.012;
      } else if (roll < 0.90) {
        scale = 0.032 + Math.random() * 0.014;
      } else {
        scale = 0.052 + Math.random() * 0.020;
      }

      // Gentle natural buoyancy rise velocity (larger bubbles rise slightly faster)
      const vy = 0.06 + scale * 1.6 + Math.random() * 0.04;
      const phase = Math.random() * Math.PI * 2;
      const wobbleSpeed = 1.2 + Math.random() * 1.4;
      const seed = Math.random();

      list.push({
        baseR,
        currentR: baseR,
        theta,
        y,
        vy,
        scale,
        phase,
        wobbleSpeed,
        seed,
      });
    }
    return list;
  }, [count]);

  // Dedicated material for jewel-like translucent oil droplets with clearcoat, fresnel rim & key specular glint
  const material = useMemo(() => {
    const mat = new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.04,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      ior: 1.48, // Genuine fragrance essential oil refractive index
      transmission: 0,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
  {
    float cosTheta = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float grazing = 1.0 - cosTheta;
    float bubbleRim = pow(grazing, 2.2) * 0.85;
    gl_FragColor.rgb += vec3(bubbleRim) * 0.65;
    gl_FragColor.a = clamp(gl_FragColor.a + bubbleRim * 0.25, 0.0, 0.95);
  }`,
      );
    };

    return mat;
  }, []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dt = Math.min(delta, 0.05);
    const vortexStrength = uniforms.uVortexStrength.value;
    const vortexDir = uniforms.uVortexDirection.value;
    const sloshMag = uniforms.uSlosh.value.length();
    const elapsedTime = state.clock.elapsedTime;

    // Detect liquid displacement from bottle spin (tornado vortex) or tilt slosh
    const isDisplaced = vortexStrength > 0.03 || sloshMag > 0.08;

    if (isDisplaced) {
      // Rapid aeration: oil concentration micro-bubbles generate rapidly upon fluid shear
      aerationEnergy.current = Math.min(1.0, aerationEnergy.current + dt * 4.5);
    } else if (aerationEnergy.current > 0) {
      // Post-displacement graceful dissolution: bubbles rise and dissipate over ~2.2 seconds
      aerationEnergy.current = Math.max(0.0, aerationEnergy.current - dt * 0.45);
      if (aerationEnergy.current < 0.02) {
        aerationEnergy.current = 0;
      }
    }

    // On static rest: bubbles are completely hidden
    if (aerationEnergy.current <= 0) {
      if (mesh.visible) {
        mesh.visible = false;
      }
      return;
    }

    // When displaced: make mesh visible and scale opacity with fluid aeration
    if (!mesh.visible) {
      mesh.visible = true;
    }
    material.opacity = 0.82 * Math.min(1.0, aerationEnergy.current * 1.5);

    // Smoothly interpolate bubble oil tint toward current fragrance color
    const normColor = getFragranceLiquidColor(liquidColor);
    targetColor.current.copy(normColor);
    currentColor.current.lerp(targetColor.current, Math.min(1.0, dt * 6.0));
    material.color.copy(currentColor.current);

    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];

      // Progressive emergence: individual bubbles appear progressively based on aeration energy
      const threshold = b.seed * 0.35;
      const localLife = Math.max(0.0, (aerationEnergy.current - threshold) / (1.0 - threshold));
      const scaleMultiplier = smoothstep(0.0, 0.4, localLife) * aerationEnergy.current;

      if (scaleMultiplier <= 0.001) {
        dummy.position.set(0, -999, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // 1. Vertical motion: natural buoyancy + vortex lift
      b.y += b.vy * dt;
      if (vortexStrength > 0.02) {
        // In the tornado funnel, peripheral fluid sweeps upward while the core dips
        const verticalFunnel = (b.currentR / MAX_RADIUS) * 0.45 * vortexStrength;
        b.y += verticalFunnel * dt;
      }

      // When reaching near the meniscus, recycle smoothly to the bottom bowl
      if (b.y > LIQUID_TOP) {
        b.y = LIQUID_BOTTOM + Math.random() * 0.12;
        b.theta = Math.random() * Math.PI * 2;
        const rRatio = Math.sqrt(0.05 + Math.random() * 0.85);
        b.baseR = MIN_RADIUS + rRatio * (MAX_RADIUS - MIN_RADIUS);
        b.currentR = b.baseR;
      }

      // 2. Radial convergence: fluid vortex pulls bubbles toward the low-pressure core
      if (vortexStrength > 0.02) {
        // Rankine vortex convergence
        const vortexCoreR = lerp(MIN_RADIUS + 0.04, MAX_RADIUS * 0.75, (b.y - LIQUID_BOTTOM) / (LIQUID_TOP - LIQUID_BOTTOM));
        const targetR = lerp(b.baseR, vortexCoreR, vortexStrength * 0.55);
        b.currentR += (targetR - b.currentR) * Math.min(1.0, dt * 3.5);
      } else {
        // Return gracefully to base radius
        b.currentR += (b.baseR - b.currentR) * Math.min(1.0, dt * 2.0);
      }

      // 3. Azimuthal swirl: Rankine vortex angular velocity (faster near core)
      if (vortexStrength > 0.02) {
        const speedFactor = 1.0 / Math.pow(Math.max(0.24, b.currentR), 0.72);
        const omega = vortexDir * (1.2 + vortexStrength * 7.2) * speedFactor;
        b.theta += omega * dt;
      } else {
        // Subtle resting organic drift
        b.theta += 0.08 * dt;
      }

      // 4. Subtle Brownian oscillation
      const wobbleX = Math.sin(elapsedTime * b.wobbleSpeed + b.phase) * 0.015;
      const wobbleZ = Math.cos(elapsedTime * (b.wobbleSpeed * 1.1) + b.phase) * 0.015;

      const x = b.currentR * Math.cos(b.theta) + wobbleX;
      const z = b.currentR * Math.sin(b.theta) + wobbleZ;

      dummy.position.set(x, b.y, z);
      dummy.scale.setScalar(b.scale * scaleMultiplier);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      renderOrder={2}
      frustumCulled={false}
      visible={false}
    />
  );
}
