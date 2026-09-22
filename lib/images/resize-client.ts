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

export type PreparedMarker = { blob: Blob; previewUrl: string; pixels: ImageData };

/**
 * Browser-only: the centre square of a photo, `PHOTO_MARKER.uploadSize` px
 * wide, as a JPEG to upload, a data URL to preview and its pixels for the
 * quality check (spec § 3.19).
 */
export async function prepareMarkerImage(file: File): Promise<PreparedMarker> {
  const bitmap = await loadBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = PHOTO_MARKER.uploadSize;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  if ("close" in bitmap) bitmap.close();
  const blob = await toJpeg(canvas, 0.85);
  return { blob, previewUrl: canvas.toDataURL("image/jpeg", 0.85), pixels: ctx.getImageData(0, 0, size, size) };
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
