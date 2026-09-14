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
export function StudioEnvironment({ intensity = 1.8 }: StudioEnvironmentProps) {
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

  // Studio backdrop: neutral studio dark cyclorama gradient (as seen in Blender / gltf-viewer)
  // This allows transmissive glass to refract transparent depth instead of solid milky white.
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#1c1c1f"); // Top / ceiling
  base.addColorStop(0.35, "#2a2a2d"); // Upper wall
  base.addColorStop(0.65, "#333338"); // Eye level horizon
  base.addColorStop(1, "#18181a"); // Floor
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Softbox panels matching Blender studio lights:
  // 1. Key Softbox (front-right: azimuth ~ 0.22, wide vertical strip softbox)
  const keyX0 = 0.16 * width;
  const keyX1 = 0.28 * width;
  const keyGrad = ctx.createLinearGradient(keyX0, 0, keyX1, 0);
  keyGrad.addColorStop(0, "rgba(255,250,242,0)");
  keyGrad.addColorStop(0.2, "rgba(255,250,242,0.95)");
  keyGrad.addColorStop(0.8, "rgba(255,250,242,0.95)");
  keyGrad.addColorStop(1, "rgba(255,250,242,0)");
  ctx.fillStyle = keyGrad;
  ctx.fillRect(keyX0, height * 0.1, keyX1 - keyX0, height * 0.75);

  // 2. Fill Softbox (front-left: azimuth ~ 0.76)
  const fillX0 = 0.70 * width;
  const fillX1 = 0.82 * width;
  const fillGrad = ctx.createLinearGradient(fillX0, 0, fillX1, 0);
  fillGrad.addColorStop(0, "rgba(255,255,255,0)");
  fillGrad.addColorStop(0.2, "rgba(255,255,255,0.75)");
  fillGrad.addColorStop(0.8, "rgba(255,255,255,0.75)");
  fillGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fillGrad;
  ctx.fillRect(fillX0, height * 0.15, fillX1 - fillX0, height * 0.65);

  // 3. Rim / Backlight Softbox (back-left: azimuth ~ 0.60)
  const rimX0 = 0.55 * width;
  const rimX1 = 0.65 * width;
  const rimGrad = ctx.createLinearGradient(rimX0, 0, rimX1, 0);
  rimGrad.addColorStop(0, "rgba(242,250,255,0)");
  rimGrad.addColorStop(0.5, "rgba(242,250,255,0.85)");
  rimGrad.addColorStop(1, "rgba(242,250,255,0)");
  ctx.fillStyle = rimGrad;
  ctx.fillRect(rimX0, height * 0.15, rimX1 - rimX0, height * 0.6);

  // 4. Overhead Top Softbox (centered at zenith)
  const topGrad = ctx.createRadialGradient(
    width * 0.5, 0, 10,
    width * 0.5, 0, height * 0.35
  );
  topGrad.addColorStop(0, "rgba(255,255,255,0.9)");
  topGrad.addColorStop(0.6, "rgba(255,255,255,0.4)");
  topGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.35);



  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}
