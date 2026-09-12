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
