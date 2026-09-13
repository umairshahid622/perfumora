/**
 * Client-side AI Color Preset Extractor.
 *
 * Dynamically analyzes perfume bottle imagery on an offscreen canvas, extracts the
 * authentic liquid and bottle hue, filters out background/cap/label noise, and
 * generates 5 luxury, tailored color presets (Signature Liquid, Soft Tint, Vibrant Accent,
 * Deep Velvet, and Warm Glow / Secondary Undertone).
 */

export interface ColorPreset {
  name: string;
  hex: string;
  description: string;
}

/** Convert RGB [0..255] to HSL: H [0..360), S [0..1], L [0..1] */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === rn) {
      h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / delta + 2) * 60;
    } else {
      h = ((rn - gn) / delta + 4) * 60;
    }
  }

  return [Math.round(h), s, l];
}

/** Convert HSL to #rrggbb hex string */
export function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(1, s));
  const ln = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hn >= 0 && hn < 60) {
    r = c; g = x; b = 0;
  } else if (hn >= 60 && hn < 120) {
    r = x; g = c; b = 0;
  } else if (hn >= 120 && hn < 180) {
    r = 0; g = c; b = x;
  } else if (hn >= 180 && hn < 240) {
    r = 0; g = x; b = c;
  } else if (hn >= 240 && hn < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => {
    const val = Math.round((n + m) * 255);
    return Math.max(0, Math.min(255, val)).toString(16).padStart(2, "0");
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Identify perfume color family name from hue and saturation */
function getColorFamilyName(h: number, s: number, l: number): string {
  if (s < 0.12) {
    if (l > 0.7) return "Parchment";
    if (l < 0.3) return "Smoky Slate";
    return "Cashmere";
  }

  const normalizedH = ((h % 360) + 360) % 360;
  if (normalizedH >= 345 || normalizedH < 15) return "Rose";
  if (normalizedH >= 15 && normalizedH < 40) return "Amber";
  if (normalizedH >= 40 && normalizedH < 62) return "Golden Olive";
  if (normalizedH >= 62 && normalizedH < 105) return "Olive";
  if (normalizedH >= 105 && normalizedH < 160) return "Botanical Green";
  if (normalizedH >= 160 && normalizedH < 205) return "Azure";
  if (normalizedH >= 205 && normalizedH < 260) return "Cobalt";
  if (normalizedH >= 260 && normalizedH < 310) return "Violet";
  return "Peony";
}

/**
 * Extracts 5 dynamic, harmonized color presets from a perfume image.
 */
export async function extractColorPresetsFromImage(
  source: string | Blob | File,
): Promise<ColorPreset[]> {
  return new Promise<ColorPreset[]>((resolve) => {
    let objectUrlToRevoke: string | null = null;
    const img = new Image();

    const cleanup = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
        objectUrlToRevoke = null;
      }
    };

    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const presets = analyzeImageCanvas(img);
        cleanup();
        resolve(presets);
      } catch (err) {
        console.warn("Canvas color analysis error, falling back to default presets:", err);
        cleanup();
        resolve(getDefaultPresets());
      }
    };

    img.onerror = async () => {
      // If direct cross-origin load failed, try fetching as a blob (e.g. Supabase storage CORS)
      if (typeof source === "string" && source.startsWith("http")) {
        try {
          const res = await fetch(source);
          const blob = await res.blob();
          objectUrlToRevoke = URL.createObjectURL(blob);
          const retryImg = new Image();
          retryImg.onload = () => {
            try {
              const presets = analyzeImageCanvas(retryImg);
              cleanup();
              resolve(presets);
            } catch {
              cleanup();
              resolve(getDefaultPresets());
            }
          };
          retryImg.onerror = () => {
            cleanup();
            resolve(getDefaultPresets());
          };
          retryImg.src = objectUrlToRevoke;
          return;
        } catch {
          cleanup();
          resolve(getDefaultPresets());
          return;
        }
      }

      cleanup();
      resolve(getDefaultPresets());
    };

    if (typeof source === "string") {
      img.src = source;
    } else {
      objectUrlToRevoke = URL.createObjectURL(source);
      img.src = objectUrlToRevoke;
    }
  });
}

/**
 * Analyzes pixel data drawn from an image element.
 */
function analyzeImageCanvas(img: HTMLImageElement): ColorPreset[] {
  const canvas = document.createElement("canvas");
  const width = 120;
  const height = 120;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return getDefaultPresets();

  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  interface SampledPixel {
    h: number;
    s: number;
    l: number;
    weight: number;
  }

  const coloredPixels: SampledPixel[] = [];
  const secondaryBuckets = new Map<number, number>(); // Hue 30-deg bucket counts

  // Sample core bottle body (x: 18% to 82%, y: 22% to 85%)
  const startX = Math.floor(width * 0.18);
  const endX = Math.floor(width * 0.82);
  const startY = Math.floor(height * 0.22);
  const endY = Math.floor(height * 0.85);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 110) continue; // transparent background

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const [h, s, l] = rgbToHsl(r, g, b);

      // Filter out:
      // 1. Dark cap/shadows/stems (L < 0.16)
      // 2. Overly bright white glare or blank paper label (L > 0.90, or L > 0.72 && S < 0.08)
      // 3. True greys/metal chrome (S < 0.08)
      if (l < 0.16 || l > 0.90) continue;
      if (l > 0.72 && s < 0.08) continue;
      if (s < 0.07) continue;

      // Weight pixels higher if they have healthy saturation and middle lightness
      const weight = s * (1 - Math.abs(l - 0.5));
      coloredPixels.push({ h, s, l, weight });

      const bucket = Math.floor(h / 30) % 12;
      secondaryBuckets.set(bucket, (secondaryBuckets.get(bucket) || 0) + weight);
    }
  }

  // If no colored liquid pixels found (e.g. clear perfume in white background), return luxury neutral presets
  if (coloredPixels.length < 10) {
    return [
      { name: "Signature Cashmere", hex: "#e7e0d5", description: "Clean, powdery luxury parchment" },
      { name: "Soft Mist", hex: "#f1ede6", description: "Luminous white musk tone" },
      { name: "Silver Iris", hex: "#b4bcc2", description: "Cool crystalline sheen" },
      { name: "Smoky Charcoal", hex: "#3a3c3f", description: "Deep midnight contrast" },
      { name: "Golden Sand", hex: "#c9bba6", description: "Warm radiant parchment" },
    ];
  }

  // Calculate circular mean for Hue (accounting for 350° and 10° boundary)
  let sinSum = 0;
  let cosSum = 0;
  let totalWeight = 0;
  let weightedSat = 0;
  let weightedLight = 0;

  for (const p of coloredPixels) {
    const rad = (p.h * Math.PI) / 180;
    sinSum += Math.sin(rad) * p.weight;
    cosSum += Math.cos(rad) * p.weight;
    weightedSat += p.s * p.weight;
    weightedLight += p.l * p.weight;
    totalWeight += p.weight;
  }

  const avgRad = Math.atan2(sinSum / totalWeight, cosSum / totalWeight);
  let dominantHue = (avgRad * 180) / Math.PI;
  if (dominantHue < 0) dominantHue += 360;

  const dominantSat = weightedSat / totalWeight;
  const dominantLight = weightedLight / totalWeight;

  const family = getColorFamilyName(dominantHue, dominantSat, dominantLight);

  // Check if a secondary distinct hue cluster exists (e.g. golden label on green liquid)
  const primaryBucket = Math.floor(dominantHue / 30) % 12;
  let secondaryHue: number | null = null;
  let maxSecondaryWeight = 0;

  for (const [bucket, weight] of secondaryBuckets.entries()) {
    const bucketDist = Math.min(Math.abs(bucket - primaryBucket), 12 - Math.abs(bucket - primaryBucket));
    if (bucketDist >= 2 && weight > maxSecondaryWeight && weight > totalWeight * 0.15) {
      maxSecondaryWeight = weight;
      secondaryHue = bucket * 30 + 15;
    }
  }

  // 1. Signature Liquid: the authentic, balanced color extracted directly from the bottle
  const sigH = dominantHue;
  const sigS = Math.max(0.24, Math.min(0.65, dominantSat * 1.15));
  const sigL = Math.max(0.38, Math.min(0.60, dominantLight));
  const sigHex = hslToHex(sigH, sigS, sigL);

  // 2. Soft Tint: airy luxury pastel for clean, light product cards
  const softH = dominantHue;
  const softS = Math.max(0.20, Math.min(0.42, dominantSat * 0.85));
  const softL = Math.max(0.64, Math.min(0.74, dominantLight * 1.25 + 0.1));
  const softHex = hslToHex(softH, softS, softL);

  // 3. Vibrant Accent: vivid, high-energy hue for bold buttons and highlights
  const vibH = dominantHue;
  const vibS = Math.max(0.55, Math.min(0.85, dominantSat * 1.55 + 0.15));
  const vibL = Math.max(0.44, Math.min(0.54, dominantLight * 0.95));
  const vibHex = hslToHex(vibH, vibS, vibL);

  // 4. Deep Velvet: rich evening shade for dark sections and high contrast
  const deepH = dominantHue;
  const deepS = Math.max(0.40, Math.min(0.70, dominantSat * 1.2));
  const deepL = Math.max(0.26, Math.min(0.36, dominantLight * 0.6));
  const deepHex = hslToHex(deepH, deepS, deepL);

  // 5. Warm Glow / Secondary Undertone:
  // If secondary cluster exists (e.g. amber accents), use it; otherwise shift towards warm golden amber (45°)
  let glowH: number;
  let glowS: number;
  let glowL: number;
  let glowName: string;

  if (secondaryHue !== null) {
    glowH = secondaryHue;
    glowS = Math.max(0.35, Math.min(0.65, dominantSat));
    glowL = Math.max(0.45, Math.min(0.62, dominantLight));
    glowName = `${getColorFamilyName(secondaryHue, glowS, glowL)} Accent`;
  } else {
    // Warm shift towards golden amber
    const shiftDir = dominantHue > 45 && dominantHue < 225 ? -1 : 1;
    glowH = (dominantHue + shiftDir * 22 + 360) % 360;
    glowS = Math.max(0.28, Math.min(0.60, dominantSat * 1.05));
    glowL = Math.max(0.48, Math.min(0.62, dominantLight * 1.05));
    glowName = "Golden Glow";
  }
  const glowHex = hslToHex(glowH, glowS, glowL);

  return [
    {
      name: `Signature ${family}`,
      hex: sigHex,
      description: "Direct bottle liquid match",
    },
    {
      name: `Soft ${family}`,
      hex: softHex,
      description: "Airy pastel luxury tint",
    },
    {
      name: `Vibrant ${family}`,
      hex: vibHex,
      description: "High-saturation accent",
    },
    {
      name: `Deep ${family}`,
      hex: deepHex,
      description: "Rich, dramatic velvet tone",
    },
    {
      name: glowName,
      hex: glowHex,
      description: "Warm luminous undertone",
    },
  ];
}

/** Fallback presets if no image is available */
export function getDefaultPresets(): ColorPreset[] {
  return [
    { name: "Light Olive", hex: "#8A9A5B", description: "Refined olive herbal tone" },
    { name: "Soft Olive", hex: "#8F9E6D", description: "Subtle muted sage" },
    { name: "Pale Olive", hex: "#98A36E", description: "Airy tea-green pastel" },
    { name: "Golden Olive", hex: "#9E9B66", description: "Warm amber-olive glow" },
    { name: "Warm Olive", hex: "#828C5A", description: "Rich organic olive" },
  ];
}
