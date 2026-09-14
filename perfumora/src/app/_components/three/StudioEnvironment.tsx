"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  SRGBColorSpace,
} from "three";

interface StudioEnvironmentProps {
  /** Overall strength of the image-based lighting. */
  intensity?: number;
}

/** Two soft vertical softboxes, as in the reference photograph's set-up. */
const SOFTBOXES = [
  { center: 0.16, width: 0.13, intensity: 1 },
  { center: 0.7, width: 0.09, intensity: 0.8 },
];

/**
 * Builds the studio lighting environment procedurally: a painted
 * equirectangular gradient (soft sky, two softboxes, darker floor) converted to
 * a prefiltered radiance map. This is what the glass actually reflects — the
 * canvas itself is transparent, so there is no visible background.
 */
export function StudioEnvironment({ intensity = 1.15 }: StudioEnvironmentProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const source = paintStudioEquirect();
    if (!source) return;

    const pmrem = new PMREMGenerator(gl);
    const envMap = pmrem.fromEquirectangular(source).texture;

    scene.environment = envMap;
    scene.environmentIntensity = intensity;

    source.dispose();
    pmrem.dispose();
    invalidate();

    return () => {
      scene.environment = null;
      envMap.dispose();
    };
  }, [gl, scene, invalidate, intensity]);

  return null;
}

function paintStudioEquirect(): CanvasTexture | null {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Studio backdrop: soft luxury gradient
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#ffffff");
  base.addColorStop(0.35, "#f6f3ee");
  base.addColorStop(0.70, "#eae5dc");
  base.addColorStop(1, "#dfd8cd");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Softboxes: bright vertical strips with soft horizontal falloff for crisp crystalline catchlights
  const studioSoftboxes = [
    { center: 0.20, width: 0.08, intensity: 1.2 },
    { center: 0.72, width: 0.07, intensity: 1.6 },
    { center: 0.46, width: 0.14, intensity: 0.85 },
  ];
  for (const box of studioSoftboxes) {
    const x0 = (box.center - box.width) * width;
    const x1 = (box.center + box.width) * width;
    const band = ctx.createLinearGradient(x0, 0, x1, 0);
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(0.5, `rgba(255,255,255,${box.intensity})`);
    band.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(x0, 0, x1 - x0, height * 0.92);
  }

  // Subtle studio flags (negative fill) on the far flanks:
  // Creates the crisp, delicate reflection contrast seen in professional perfume photography
  const studioFlags = [
    { center: 0.02, width: 0.03, intensity: 0.25 },
    { center: 0.90, width: 0.03, intensity: 0.22 },
  ];
  for (const flag of studioFlags) {
    const x0 = (flag.center - flag.width) * width;
    const x1 = (flag.center + flag.width) * width;
    const band = ctx.createLinearGradient(x0, 0, x1, 0);
    band.addColorStop(0, "rgba(80,75,70,0)");
    band.addColorStop(0.5, `rgba(80,75,70,${flag.intensity})`);
    band.addColorStop(1, "rgba(80,75,70,0)");
    ctx.fillStyle = band;
    ctx.fillRect(x0, 0, x1 - x0, height * 0.88);
  }



  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}
