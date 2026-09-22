/**
 * Grayscale image toolbox for the photo markers (spec § 3.19): pure typed
 * arrays, no DOM, shared by the phone (camera frames, reference photos) and
 * the tests (synthetic frames). Pixels are row-major, 0–255.
 */
export type GrayImage = { width: number; height: number; data: Uint8Array };

export type Point = { x: number; y: number };

/** 3 × 3 matrix, row-major. */
export type Mat3 = Float64Array;

/** Luma of an RGBA buffer (ImageData layout). */
export function grayFromRgba(rgba: ArrayLike<number>, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 1, j += 4) data[i] = (rgba[j] * 77 + rgba[j + 1] * 151 + rgba[j + 2] * 28) >> 8;
  return { width, height, data };
}

/** Half-size copy (2 × 2 box average); an odd last row or column is dropped. */
export function halve(img: GrayImage): GrayImage {
  const width = img.width >> 1;
  const height = img.height >> 1;
  const data = new Uint8Array(width * height);
  const src = img.data;
  const stride = img.width;
  for (let y = 0; y < height; y += 1) {
    let s = 2 * y * stride;
    let d = y * width;
    for (let x = 0; x < width; x += 1, s += 2, d += 1) data[d] = (src[s] + src[s + 1] + src[s + stride] + src[s + stride + 1] + 2) >> 2;
  }
  return { width, height, data };
}

/** Bilinear sample, coordinates clamped to the image. */
export function sampleBilinear(img: GrayImage, x: number, y: number): number {
  const { width, height, data } = img;
  const cx = Math.min(Math.max(x, 0), width - 1);
  const cy = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx;
  const bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Bilinear resample to `width × height` (pixel centres aligned). */
export function resample(img: GrayImage, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y += 1) {
    const fy = (y + 0.5) * sy - 0.5;
    for (let x = 0; x < width; x += 1) data[y * width + x] = Math.round(sampleBilinear(img, (x + 0.5) * sx - 0.5, fy));
  }
  return { width, height, data };
}

/** Separable [1 4 6 4 1] / 16 blur, edges clamped. */
export function blur(img: GrayImage): GrayImage {
  const { width, height, data } = img;
  const tmp = new Uint16Array(width * height);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - 2);
      const x1 = Math.max(0, x - 1);
      const x3 = Math.min(width - 1, x + 1);
      const x4 = Math.min(width - 1, x + 2);
      tmp[row + x] = data[row + x0] + 4 * data[row + x1] + 6 * data[row + x] + 4 * data[row + x3] + data[row + x4];
    }
  }
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - 2) * width;
    const y1 = Math.max(0, y - 1) * width;
    const y2 = y * width;
    const y3 = Math.min(height - 1, y + 1) * width;
    const y4 = Math.min(height - 1, y + 2) * width;
    for (let x = 0; x < width; x += 1) out[y2 + x] = (tmp[y0 + x] + 4 * tmp[y1 + x] + 6 * tmp[y2 + x] + 4 * tmp[y3 + x] + tmp[y4 + x] + 128) >> 8;
  }
  return { width, height, data: out };
}

/** The centred square of an image (a non-square photo is cropped, never stretched). */
export function centreSquare(img: GrayImage): GrayImage {
  const side = Math.min(img.width, img.height);
  if (side === img.width && side === img.height) return img;
  const ox = (img.width - side) >> 1;
  const oy = (img.height - side) >> 1;
  const data = new Uint8Array(side * side);
  for (let y = 0; y < side; y += 1) data.set(img.data.subarray((oy + y) * img.width + ox, (oy + y) * img.width + ox + side), y * side);
  return { width: side, height: side, data };
}

/** A rectangle of pixels (clamped to the image); `x` / `y` are the offsets to add back to positions found inside. */
export function crop(img: GrayImage, x: number, y: number, width: number, height: number): GrayImage & { x: number; y: number } {
  const x0 = Math.max(0, Math.min(img.width, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.height, Math.floor(y)));
  const x1 = Math.max(x0, Math.min(img.width, Math.ceil(x + width)));
  const y1 = Math.max(y0, Math.min(img.height, Math.ceil(y + height)));
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Uint8Array(w * h);
  for (let row = 0; row < h; row += 1) data.set(img.data.subarray((y0 + row) * img.width + x0, (y0 + row) * img.width + x1), row * w);
  return { width: w, height: h, data, x: x0, y: y0 };
}

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return out;
}

export function mat3Invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return Float64Array.of(A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv, B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv, C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv);
}

/** Applies a homography to a point; `w` ≤ 0 means the point is behind the camera. */
export function project(m: Mat3, x: number, y: number): Point & { w: number } {
  const w = m[6] * x + m[7] * y + m[8];
  const inv = w !== 0 ? 1 / w : 0;
  return { x: (m[0] * x + m[1] * y + m[2]) * inv, y: (m[3] * x + m[4] * y + m[5]) * inv, w };
}

/**
 * Draws `src` warped through `H` (source pixels → destination pixels) onto
 * `dst`, in place: destination pixels that map inside the source are
 * overwritten, the others are left untouched. Used by the tests to fake a
 * camera frame.
 */
export function warpOnto(src: GrayImage, H: Mat3, dst: GrayImage): void {
  const inv = mat3Invert(H);
  if (!inv) return;
  for (let y = 0; y < dst.height; y += 1) {
    for (let x = 0; x < dst.width; x += 1) {
      const p = project(inv, x, y);
      if (p.w === 0 || p.x < 0 || p.y < 0 || p.x > src.width - 1 || p.y > src.height - 1) continue;
      dst.data[y * dst.width + x] = Math.round(sampleBilinear(src, p.x, p.y));
    }
  }
}
