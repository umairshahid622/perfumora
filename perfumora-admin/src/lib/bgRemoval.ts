/**
 * Client-side AI background removal service.
 *
 * Uses `@imgly/background-removal` (ONNX / WebAssembly) running 100% in the browser.
 * No external API key, recurring subscriptions, or third-party server uploads required.
 * Dynamically imported to avoid bundle bloat when viewing existing fragrances.
 */

export interface BgRemovalProgress {
  message: string;
  percent?: number;
}

export async function removeImageBackground(
  imageSource: File | Blob | string,
  onProgress?: (progress: BgRemovalProgress) => void,
): Promise<Blob> {
  onProgress?.({ message: "Initializing AI model...", percent: 10 });

  // Dynamic import so the WASM bundle is only loaded on demand
  const imgly = await import("@imgly/background-removal");
  const removeBackground = imgly.removeBackground ?? imgly.default;

  const blob = await removeBackground(imageSource, {
    model: "isnet_fp16",
    output: {
      format: "image/png",
      quality: 0.95,
    },
    progress: (key: string, current: number, total: number) => {
      let message = "Processing image...";
      let percent = Math.min(95, Math.round((current / (total || 1)) * 100));

      if (key.includes("fetch")) {
        message = "Loading AI model (cached after first use)...";
      } else if (key.includes("compute")) {
        message = "Extracting perfume bottle & removing background...";
        percent = Math.max(50, percent);
      }

      onProgress?.({ message, percent });
    },
  });

  onProgress?.({ message: "Background removal complete!", percent: 100 });
  return blob;
}

/**
 * Trims a percentage off the bottom of an image (e.g. to snip away
 * studio tabletop mirror reflections) while maintaining transparent alpha.
 */
export async function trimImageBottom(
  imageBlob: Blob,
  trimPercent: number, // 0 to 40
): Promise<Blob> {
  if (trimPercent <= 0) return imageBlob;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const factor = Math.max(0.5, Math.min(1, 1 - trimPercent / 100));
        const targetHeight = Math.round(img.naturalHeight * factor);
        const width = img.naturalWidth;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(imageBlob);
          return;
        }

        // Draw the top portion (cutting off the bottom reflection)
        ctx.drawImage(
          img,
          0,
          0,
          width,
          targetHeight,
          0,
          0,
          width,
          targetHeight,
        );

        canvas.toBlob(
          (result) => {
            if (result) resolve(result);
            else resolve(imageBlob);
          },
          "image/png",
          0.95,
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(imageBlob);
    };

    img.src = url;
  });
}

/**
 * Detects the tilt angle (in degrees) of a transparent bottle cutout.
 * Uses linear regression of horizontal center-lines across the bottle silhouette.
 * Returns negative if tilted left, positive if tilted right.
 */
export async function detectTiltAngle(imageBlob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 400;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(0);

        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);

        // 1. Find overall vertical bounds of the bottle
        let topY = -1;
        let bottomY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 40) {
              if (topY === -1) topY = y;
              bottomY = y;
            }
          }
        }

        const bottleHeight = bottomY - topY;
        if (bottleHeight < 40) return resolve(0);

        // 2. Cap top edge analysis (the horizontal top of the bottle cap)
        const capTopYByX: Record<number, number> = {};
        const capMaxY = topY + bottleHeight * 0.12;

        for (let y = topY; y < capMaxY; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 40) {
              if (capTopYByX[x] === undefined || y < capTopYByX[x]) {
                capTopYByX[x] = y;
              }
            }
          }
        }

        const capXs = Object.keys(capTopYByX).map(Number).sort((a, b) => a - b);
        let capAngleDeg = 0;
        let hasCapAngle = false;

        if (capXs.length >= 20) {
          // Discard outer 15% corners to avoid chamfers / rounding
          const start = Math.floor(capXs.length * 0.15);
          const end = Math.floor(capXs.length * 0.85);
          const sampleXs = capXs.slice(start, end);

          let meanX = 0;
          let meanY = 0;
          for (const x of sampleXs) {
            meanX += x;
            meanY += capTopYByX[x];
          }
          meanX /= sampleXs.length;
          meanY /= sampleXs.length;

          let num = 0;
          let den = 0;
          for (const x of sampleXs) {
            const dx = x - meanX;
            const dy = capTopYByX[x] - meanY;
            num += dx * dy;
            den += dx * dx;
          }

          if (den > 0) {
            const slope = num / den; // dy / dx
            capAngleDeg = (Math.atan(slope) * 180) / Math.PI;
            if (Math.abs(capAngleDeg) <= 20) {
              hasCapAngle = true;
            }
          }
        }

        // 3. Vertical midline centroid regression across the bottle
        const rowCenters: { y: number; x: number; weight: number }[] = [];

        for (let y = topY; y < bottomY; y++) {
          let sumX = 0;
          let weight = 0;
          const rowOffset = y * w * 4;

          for (let x = 0; x < w; x++) {
            const alpha = data[rowOffset + x * 4 + 3];
            if (alpha > 40) {
              sumX += x * alpha;
              weight += alpha;
            }
          }

          if (weight > 40 * 15) {
            rowCenters.push({ y, x: sumX / weight, weight });
          }
        }

        let vertAngleDeg = 0;
        let hasVertAngle = false;

        if (rowCenters.length >= 20) {
          const startIdx = Math.floor(rowCenters.length * 0.08);
          const endIdx = Math.floor(rowCenters.length * 0.92);
          const sample = rowCenters.slice(startIdx, endIdx);

          let meanY = 0;
          let meanX = 0;
          for (const p of sample) {
            meanY += p.y;
            meanX += p.x;
          }
          meanY /= sample.length;
          meanX /= sample.length;

          let num = 0;
          let den = 0;
          for (const p of sample) {
            const dy = p.y - meanY;
            const dx = p.x - meanX;
            num += dy * dx;
            den += dy * dy;
          }

          if (den > 0) {
            const slope = num / den; // dx / dy
            vertAngleDeg = (Math.atan(-slope) * 180) / Math.PI;
            if (Math.abs(vertAngleDeg) <= 20) {
              hasVertAngle = true;
            }
          }
        }

        // Ensemble: Cap angle is the strongest visual cue for horizontal flatness;
        // if available, prioritize it, otherwise use vertical midline.
        let finalAngle = 0;
        if (hasCapAngle && hasVertAngle) {
          // If both agree in sign, blend with high weight on cap
          if (Math.sign(capAngleDeg) === Math.sign(vertAngleDeg)) {
            finalAngle = capAngleDeg * 0.7 + vertAngleDeg * 0.3;
          } else {
            finalAngle = capAngleDeg;
          }
        } else if (hasCapAngle) {
          finalAngle = capAngleDeg;
        } else if (hasVertAngle) {
          finalAngle = vertAngleDeg;
        }

        resolve(Math.round(finalAngle * 10) / 10);
      } catch {
        resolve(0);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };

    img.src = url;
  });
}

/**
 * Rotates an image by the specified angle (in degrees) around its center,
 * preserving transparent alpha and adjusting canvas bounds so nothing is clipped.
 */
export async function rotateImage(
  imageBlob: Blob,
  angleDegrees: number,
): Promise<Blob> {
  if (Math.abs(angleDegrees) < 0.1) return imageBlob;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const rad = (angleDegrees * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rad));
        const cos = Math.abs(Math.cos(rad));

        const w = img.naturalWidth;
        const h = img.naturalHeight;

        // Calculate bounding box so nothing is clipped
        const newWidth = Math.round(w * cos + h * sin);
        const newHeight = Math.round(w * sin + h * cos);

        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(imageBlob);

        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -w / 2, -h / 2);

        canvas.toBlob(
          (result) => {
            if (result) resolve(result);
            else resolve(imageBlob);
          },
          "image/png",
          0.95,
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(imageBlob);
    };

    img.src = url;
  });
}

/**
 * Converts a Blob to a File with a sanitized PNG filename ready for Supabase storage upload.
 */
export function blobToFile(
  blob: Blob,
  originalFilename: string,
  suffix = "transparent",
): File {
  const baseName = originalFilename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${baseName}-${suffix}.png`;
  return new File([blob], fileName, { type: "image/png" });
}
