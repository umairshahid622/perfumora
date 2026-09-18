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

  // High-key luxury studio backdrop matching the parchment paper aesthetic
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#ffffff");
  base.addColorStop(0.35, "#fbf8f3");
  base.addColorStop(0.70, "#f2ecdf");
  base.addColorStop(1, "#e6decb");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Softbox panels matching luxury perfume product photography:
  // 1. Key Softbox Strip (front-right: azimuth ~ 0.20, vertical strip softbox)
  const keyX0 = 0.16 * width;
  const keyX1 = 0.27 * width;
  const keyGrad = ctx.createLinearGradient(keyX0, 0, keyX1, 0);
  keyGrad.addColorStop(0, "rgba(255,255,255,0)");
  keyGrad.addColorStop(0.2, "rgba(255,252,246,0.95)");
  keyGrad.addColorStop(0.5, "rgba(255,255,255,1.0)");
  keyGrad.addColorStop(0.8, "rgba(255,252,246,0.95)");
  keyGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = keyGrad;
  ctx.fillRect(keyX0, height * 0.08, keyX1 - keyX0, height * 0.80);

  // 2. Fill Softbox Strip (front-left: azimuth ~ 0.76)
  const fillX0 = 0.70 * width;
  const fillX1 = 0.81 * width;
  const fillGrad = ctx.createLinearGradient(fillX0, 0, fillX1, 0);
  fillGrad.addColorStop(0, "rgba(255,255,255,0)");
  fillGrad.addColorStop(0.25, "rgba(242,248,255,0.85)");
  fillGrad.addColorStop(0.5, "rgba(255,255,255,0.95)");
  fillGrad.addColorStop(0.75, "rgba(242,248,255,0.85)");
  fillGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fillGrad;
  ctx.fillRect(fillX0, height * 0.12, fillX1 - fillX0, height * 0.72);

  // 3. Rim / Backlight Softbox (back-left: azimuth ~ 0.58)
  const rimX0 = 0.54 * width;
  const rimX1 = 0.64 * width;
  const rimGrad = ctx.createLinearGradient(rimX0, 0, rimX1, 0);
  rimGrad.addColorStop(0, "rgba(255,255,255,0)");
  rimGrad.addColorStop(0.5, "rgba(245,250,255,0.95)");
  rimGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rimGrad;
  ctx.fillRect(rimX0, height * 0.12, rimX1 - rimX0, height * 0.65);

  // 4. Overhead Top Softbox (centered at zenith)
  const topGrad = ctx.createRadialGradient(
    width * 0.5, 0, 10,
    width * 0.5, 0, height * 0.38
  );
  topGrad.addColorStop(0, "rgba(255,255,255,1.0)");
  topGrad.addColorStop(0.4, "rgba(255,255,255,0.75)");
  topGrad.addColorStop(0.8, "rgba(255,255,255,0.15)");
  topGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.38);

  // 5. Bottom Crystal Base Reflector (under-horizon caustic bounce)
  const btmX0 = 0.14 * width;
  const btmX1 = 0.86 * width;
  const btmGrad = ctx.createLinearGradient(btmX0, 0, btmX1, 0);
  btmGrad.addColorStop(0, "rgba(255,255,255,0)");
  btmGrad.addColorStop(0.25, "rgba(255,250,240,0.85)");
  btmGrad.addColorStop(0.5, "rgba(255,255,255,1.0)");
  btmGrad.addColorStop(0.75, "rgba(255,250,240,0.85)");
  btmGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = btmGrad;
  ctx.fillRect(btmX0, height * 0.78, btmX1 - btmX0, height * 0.16);

  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}
