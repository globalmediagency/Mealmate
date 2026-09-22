import { PHOTO_MARKER } from "@/lib/ar/config";
import { FEEDING } from "@/lib/game/config";

/** Browser-only: downsizes a photo to ≤ `FEEDING.resizeMaxPx` (768 px) JPEG (quality 0.8, ≤ 1.5 Mo). */
export async function prepareMealImage(file: File): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, FEEDING.resizeMaxPx / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  let quality = FEEDING.resizeJpegQuality;
  let blob = await toJpeg(canvas, quality);
  while (blob.size > FEEDING.maxImageBytesAfterResize && quality > 0.5) {
    quality -= 0.1;
    blob = await toJpeg(canvas, quality);
  }
  return blob;
}

export type PreparedMarker = { blob: Blob; previewUrl: string; pixels: ImageData; fraction: number };

/** A decoded photo kept while the user adjusts the crop; `close()` frees it. */
export type MarkerSource = { image: ImageBitmap | HTMLImageElement; width: number; height: number; close(): void };

/** Browser-only: decodes a photo once (EXIF orientation applied) so several crops can be tried. */
export async function loadMarkerSource(file: File): Promise<MarkerSource> {
  const image = await loadBitmap(file);
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (width === 0 || height === 0) throw new Error("empty image");
  return {
    image,
    width,
    height,
    close: () => {
      if ("close" in image) image.close();
    },
  };
}

/**
 * Browser-only: the centre square of the photo, `fraction` of its short side
 * (spec § 3.19: the object, not the table around it), resampled to
 * `PHOTO_MARKER.uploadSize` px in halving steps (one big drawImage aliases
 * on Safari), as a JPEG to upload, a data URL to preview and its pixels for
 * the quality check.
 */
export async function cropMarkerImage(source: MarkerSource, fraction: number = PHOTO_MARKER.cropFraction): Promise<PreparedMarker> {
  const f = Math.min(1, Math.max(PHOTO_MARKER.minCropFraction, fraction));
  const side = Math.max(1, Math.round(Math.min(source.width, source.height) * f));
  const size = PHOTO_MARKER.uploadSize;
  let src: CanvasImageSource = source.image;
  let sx = (source.width - side) / 2;
  let sy = (source.height - side) / 2;
  let sw = side;
  let sh = side;
  while (sw / size > 2) {
    const half = document.createElement("canvas");
    half.width = Math.ceil(sw / 2);
    half.height = Math.ceil(sh / 2);
    const hctx = half.getContext("2d");
    if (!hctx) throw new Error("canvas");
    hctx.drawImage(src, sx, sy, sw, sh, 0, 0, half.width, half.height);
    src = half;
    sx = 0;
    sy = 0;
    sw = half.width;
    sh = half.height;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, size, size);
  const blob = await toJpeg(canvas, 0.85);
  return { blob, previewUrl: canvas.toDataURL("image/jpeg", 0.85), pixels: ctx.getImageData(0, 0, size, size), fraction: f };
}

/** One-shot helper: decode, crop with the default fraction, free the picture. */
export async function prepareMarkerImage(file: File, fraction?: number): Promise<PreparedMarker> {
  const source = await loadMarkerSource(file);
  try {
    return await cropMarkerImage(source, fraction);
  } finally {
    source.close();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall back to <img> below (older Safari, unusual formats).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/jpeg", quality);
  });
}
