import type { GrayImage } from "./image";

/** A corner: integer pixel position and its FAST score. */
export type Keypoint = { x: number; y: number; score: number };

/** Bresenham circle of radius 3 around a pixel, clockwise from the top. */
const CIRCLE: readonly (readonly [number, number])[] = [
  [0, -3],
  [1, -3],
  [2, -2],
  [3, -1],
  [3, 0],
  [3, 1],
  [2, 2],
  [1, 3],
  [0, 3],
  [-1, 3],
  [-2, 2],
  [-3, 1],
  [-3, 0],
  [-3, -1],
  [-2, -2],
  [-1, -3],
];
/** Contiguous circle pixels that must all be brighter (or all darker) than the centre. */
const ARC = 9;
const CARDINALS = [0, 4, 8, 12];

/** One score map reused across calls (a fresh Float32Array per frame would churn megabytes on a phone). */
let scratch: Float32Array | null = null;
function scoreBuffer(length: number): Float32Array {
  if (!scratch || scratch.length < length) scratch = new Float32Array(length);
  scratch.fill(0, 0, length);
  return scratch;
}

/**
 * FAST-9 corners (Rosten & Drummond) with 3 × 3 non-maximum suppression on
 * the score (sum of the contrast of the arc beyond the threshold). Pixels
 * closer than `margin` to the border are skipped so that a descriptor can
 * be computed around every corner.
 */
export function detectFast(img: GrayImage, threshold: number, margin = 3): Keypoint[] {
  const { width, height, data } = img;
  const m = Math.max(3, margin);
  if (width <= 2 * m || height <= 2 * m) return [];
  const offsets = CIRCLE.map(([dx, dy]) => dy * width + dx);
  const scores = scoreBuffer(width * height);
  const states = new Int8Array(16);
  for (let y = m; y < height - m; y += 1) {
    for (let x = m; x < width - m; x += 1) {
      const i = y * width + x;
      const p = data[i];
      const hi = p + threshold;
      const lo = p - threshold;
      // Quick rejection: a 9-long arc covers at least two of the four cardinal pixels.
      let bright = 0;
      let dark = 0;
      for (const k of CARDINALS) {
        const v = data[i + offsets[k]];
        if (v > hi) bright += 1;
        else if (v < lo) dark += 1;
      }
      if (bright < 2 && dark < 2) continue;
      for (let k = 0; k < 16; k += 1) {
        const v = data[i + offsets[k]];
        states[k] = v > hi ? 1 : v < lo ? -1 : 0;
      }
      let best = 0;
      for (let sign = 1; sign >= -1; sign -= 2) {
        if (sign === 1 ? bright < 2 : dark < 2) continue;
        let run = 0;
        let sum = 0;
        for (let k = 0; k < 16 + ARC - 1; k += 1) {
          const kk = k & 15;
          if (states[kk] === sign) {
            run += 1;
            if (run <= 16) sum += Math.abs(data[i + offsets[kk]] - p) - threshold;
            if (run >= ARC && sum > best) best = sum;
          } else {
            run = 0;
            sum = 0;
          }
        }
      }
      if (best > 0) scores[i] = best;
    }
  }
  const points: Keypoint[] = [];
  for (let y = m; y < height - m; y += 1) {
    for (let x = m; x < width - m; x += 1) {
      const i = y * width + x;
      const s = scores[i];
      if (s === 0) continue;
      if (
        s > scores[i - 1] &&
        s >= scores[i + 1] &&
        s > scores[i - width - 1] &&
        s > scores[i - width] &&
        s > scores[i - width + 1] &&
        s >= scores[i + width - 1] &&
        s >= scores[i + width] &&
        s >= scores[i + width + 1]
      )
        points.push({ x, y, score: s });
    }
  }
  return points;
}

/**
 * At most `max` corners: half the budget goes to the strongest corners
 * anywhere (a small contrasted drawing on a textured table keeps its corners
 * instead of being rationed like the table), the other half is spread over
 * a `cells × cells` grid (the strongest of each cell first, then the
 * strongest of the rest).
 */
export function selectSpread(points: Keypoint[], width: number, height: number, max: number, cells = 8): Keypoint[] {
  if (points.length <= max) return points;
  const byScore = (a: Keypoint, b: Keypoint) => b.score - a.score;
  const sorted = [...points].sort(byScore);
  const strongest = sorted.slice(0, max >> 1);
  const others = sorted.slice(max >> 1);
  const budget = max - strongest.length;
  const cell = Math.max(1, Math.ceil(Math.max(width, height) / cells));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const buckets: Keypoint[][] = Array.from({ length: cols * rows }, () => []);
  for (const p of others) buckets[Math.floor(p.y / cell) * cols + Math.floor(p.x / cell)].push(p);
  const filled = buckets.filter((b) => b.length > 0).length;
  const perCell = Math.max(1, Math.ceil(budget / Math.max(1, filled)));
  const chosen: Keypoint[] = [];
  const rest: Keypoint[] = [];
  for (const bucket of buckets) {
    // Buckets keep the global order: each one is already sorted by score.
    chosen.push(...bucket.slice(0, perCell));
    rest.push(...bucket.slice(perCell));
  }
  if (chosen.length >= budget) return strongest.concat(chosen.sort(byScore).slice(0, budget));
  rest.sort(byScore);
  return strongest.concat(chosen, rest.slice(0, budget - chosen.length));
}
