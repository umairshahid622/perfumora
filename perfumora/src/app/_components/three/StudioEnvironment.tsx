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

  // Sky → floor falloff
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#ffffff");
  base.addColorStop(0.45, "#eceae6");
  base.addColorStop(0.62, "#d7d3cd");
  base.addColorStop(1, "#a9a5a0");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Softboxes: bright vertical bands with soft horizontal falloff
  for (const box of SOFTBOXES) {
    const x0 = (box.center - box.width) * width;
    const x1 = (box.center + box.width) * width;
    const band = ctx.createLinearGradient(x0, 0, x1, 0);
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(0.5, `rgba(255,255,255,${box.intensity})`);
    band.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(x0, 0, x1 - x0, height * 0.78);
  }

  // Fade the softboxes out towards the floor so highlights stay in the upper
  // hemisphere and the glass keeps a darker core near its base.
  const fade = ctx.createLinearGradient(0, height * 0.42, 0, height);
  fade.addColorStop(0, "rgba(150,146,141,0)");
  fade.addColorStop(1, "rgba(150,146,141,0.9)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.42, width, height * 0.58);

  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}
