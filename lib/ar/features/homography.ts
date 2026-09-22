import { mat3Multiply, project, type Mat3, type Point } from "./image";

/** Solves `A x = b` (n × n, row-major) in place by Gaussian elimination with partial pivoting; null when singular. */
export function solveLinear(a: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r * n + col]) > Math.abs(a[pivot * n + col])) pivot = r;
    if (Math.abs(a[pivot * n + col]) < 1e-12) return null;
    if (pivot !== col) {
      for (let c = 0; c < n; c += 1) {
        const t = a[col * n + c];
        a[col * n + c] = a[pivot * n + c];
        a[pivot * n + c] = t;
      }
      const t = b[col];
      b[col] = b[pivot];
      b[pivot] = t;
    }
    for (let r = col + 1; r < n; r += 1) {
      const f = a[r * n + col] / a[col * n + col];
      if (f === 0) continue;
      for (let c = col; c < n; c += 1) a[r * n + c] -= f * a[col * n + c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = b[r];
    for (let c = r + 1; c < n; c += 1) s -= a[r * n + c] * x[c];
    x[r] = s / a[r * n + r];
  }
  return x;
}

type Normalised = { x: Float64Array; y: Float64Array; T: Mat3; inverse: Mat3 };

/** Hartley normalisation: centroid at the origin, mean distance √2. */
function normalise(points: Float32Array, indices: ArrayLike<number>): Normalised {
  const n = indices.length;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    cx += points[2 * indices[i]];
    cy += points[2 * indices[i] + 1];
  }
  cx /= n;
  cy /= n;
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += Math.hypot(points[2 * indices[i]] - cx, points[2 * indices[i] + 1] - cy);
  mean /= n;
  const s = mean > 1e-9 ? Math.SQRT2 / mean : 1;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    x[i] = (points[2 * indices[i]] - cx) * s;
    y[i] = (points[2 * indices[i] + 1] - cy) * s;
  }
  return { x, y, T: Float64Array.of(s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1), inverse: Float64Array.of(1 / s, 0, cx, 0, 1 / s, cy, 0, 0, 1) };
}

/**
 * Homography mapping `src` points to `dst` points (interleaved x / y, the
 * `indices` chosen), least squares on the normalised DLT with h33 = 1; the
 * exact solution for four points. Null when degenerate.
 */
export function fitHomography(src: Float32Array, dst: Float32Array, indices: ArrayLike<number>): Mat3 | null {
  const n = indices.length;
  if (n < 4) return null;
  const s = normalise(src, indices);
  const d = normalise(dst, indices);
  const ata = new Float64Array(64);
  const atb = new Float64Array(8);
  const row = new Float64Array(8);
  const accumulate = (rhs: number) => {
    for (let i = 0; i < 8; i += 1) {
      if (row[i] === 0) continue;
      for (let j = 0; j < 8; j += 1) ata[i * 8 + j] += row[i] * row[j];
      atb[i] += row[i] * rhs;
    }
  };
  for (let i = 0; i < n; i += 1) {
    const x = s.x[i];
    const y = s.y[i];
    const u = d.x[i];
    const v = d.y[i];
    row.set([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    accumulate(u);
    row.set([0, 0, 0, x, y, 1, -v * x, -v * y]);
    accumulate(v);
  }
  const h = solveLinear(ata, atb, 8);
  if (!h) return null;
  const hn = Float64Array.of(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1);
  const H = mat3Multiply(mat3Multiply(d.inverse, hn), s.T);
  if (!Number.isFinite(H[8]) || Math.abs(H[8]) < 1e-12) return null;
  for (let k = 0; k < 9; k += 1) H[k] /= H[8];
  return H;
}

export type RansacOptions = {
  /** Reprojection error (destination units) under which a correspondence is an inlier. */
  threshold?: number;
  maxIterations?: number;
  confidence?: number;
  minInliers?: number;
  random?: () => number;
};

export type RansacResult = { H: Mat3; inliers: number[] };

/** Three of four source points nearly aligned: the sample cannot fix a homography. */
function degenerate(src: Float32Array, sample: number[]): boolean {
  for (let a = 0; a < 4; a += 1)
    for (let b = a + 1; b < 4; b += 1)
      for (let c = b + 1; c < 4; c += 1) {
        const ax = src[2 * sample[a]];
        const ay = src[2 * sample[a] + 1];
        const cross = (src[2 * sample[b]] - ax) * (src[2 * sample[c] + 1] - ay) - (src[2 * sample[b] + 1] - ay) * (src[2 * sample[c]] - ax);
        if (Math.abs(cross) < 8) return true;
      }
  return false;
}

/** RANSAC over `count` correspondences, then a least-squares refit on the inliers (twice). */
export function ransacHomography(src: Float32Array, dst: Float32Array, count: number, options: RansacOptions = {}): RansacResult | null {
  const threshold = options.threshold ?? 4;
  const maxIterations = options.maxIterations ?? 500;
  const confidence = options.confidence ?? 0.995;
  const minInliers = Math.max(4, options.minInliers ?? 12);
  const random = options.random ?? Math.random;
  if (count < minInliers) return null;
  const thr2 = threshold * threshold;
  const inliersOf = (H: Mat3): number[] => {
    const inl: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const p = project(H, src[2 * i], src[2 * i + 1]);
      if (p.w <= 0) continue;
      const dx = p.x - dst[2 * i];
      const dy = p.y - dst[2 * i + 1];
      if (dx * dx + dy * dy < thr2) inl.push(i);
    }
    return inl;
  };
  let best: number[] = [];
  let iterations = maxIterations;
  const sample = [0, 0, 0, 0];
  for (let it = 0; it < iterations; it += 1) {
    let distinct = true;
    for (let k = 0; k < 4; k += 1) {
      let candidate = Math.floor(random() * count);
      for (let guard = 0; guard < 10; guard += 1) {
        let clash = false;
        for (let j = 0; j < k; j += 1) if (sample[j] === candidate) clash = true;
        if (!clash) break;
        candidate = Math.floor(random() * count);
      }
      for (let j = 0; j < k; j += 1) if (sample[j] === candidate) distinct = false;
      sample[k] = candidate;
    }
    if (!distinct || degenerate(src, sample)) continue;
    const H = fitHomography(src, dst, sample);
    if (!H) continue;
    const inl = inliersOf(H);
    if (inl.length > best.length) {
      best = inl;
      const w = Math.min(0.999, inl.length / count);
      const needed = Math.ceil(Math.log(1 - confidence) / Math.log(1 - w ** 4));
      iterations = Math.min(maxIterations, Math.max(20, Number.isFinite(needed) ? needed : maxIterations));
    }
  }
  if (best.length < minInliers) return null;
  let H = fitHomography(src, dst, best);
  if (!H) return null;
  for (let round = 0; round < 2; round += 1) {
    const inl = inliersOf(H);
    if (inl.length < minInliers) return null;
    const refit = fitHomography(src, dst, inl);
    if (!refit) break;
    H = refit;
    best = inl;
  }
  return { H, inliers: best };
}

export type Quad = [Point, Point, Point, Point];

/** The reference square's corners (top-left, top-right, bottom-right, bottom-left) through `H`; null when a corner falls behind the camera. */
export function projectedQuad(H: Mat3, size: number): Quad | null {
  const corners = [project(H, 0, 0), project(H, size, 0), project(H, size, size), project(H, 0, size)];
  if (corners.some((c) => c.w <= 0 || !Number.isFinite(c.x) || !Number.isFinite(c.y))) return null;
  return corners.map((c) => ({ x: c.x, y: c.y })) as Quad;
}

/** A quad a real paper could project to: convex, same winding as the reference (no mirror), sides not too short nor too unequal. */
export function isSaneQuad(quad: Quad, minSide = 16, maxRatio = 5): boolean {
  const sides: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross <= 0) return false;
    sides.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const shortest = Math.min(...sides);
  const longest = Math.max(...sides);
  return shortest >= minSide && longest <= maxRatio * shortest;
}
