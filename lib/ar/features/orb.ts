import type { Keypoint } from "./fast";
import type { GrayImage } from "./image";

/** Words of 32 bits per descriptor (256 bits). */
export const DESCRIPTOR_WORDS = 8;
const PAIRS = DESCRIPTOR_WORDS * 32;
/** Sampling pairs are drawn within ±13 px of the corner; rotated, they reach ≈ 18 px. */
const PATCH_RADIUS = 13;
/** Corners closer than this to the border cannot be described. */
export const DESCRIBE_MARGIN = 20;
/** Radius of the disc whose intensity centroid gives the corner's orientation. */
const CENTROID_RADIUS = 15;
const ANGLE_BINS = 30;

/** Deterministic PRNG (mulberry32): the same pattern on every phone. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  let u = 0;
  while (u === 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** BRIEF's Gaussian sampling pattern: 256 pairs (x1, y1, x2, y2), σ ≈ patch / 5. */
const BASE_PATTERN: Int8Array = (() => {
  const random = mulberry32(0x4d4d4154);
  const pattern = new Int8Array(PAIRS * 4);
  const sigma = 6.2;
  for (let i = 0; i < pattern.length; i += 1) pattern[i] = Math.max(-PATCH_RADIUS, Math.min(PATCH_RADIUS, Math.round(gaussian(random) * sigma)));
  return pattern;
})();

/** The pattern rotated for each orientation bin (steered BRIEF). */
const ROTATED: Int8Array[] = Array.from({ length: ANGLE_BINS }, (_, bin) => {
  const angle = (bin * 2 * Math.PI) / ANGLE_BINS;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out = new Int8Array(PAIRS * 4);
  for (let i = 0; i < PAIRS * 4; i += 2) {
    const x = BASE_PATTERN[i];
    const y = BASE_PATTERN[i + 1];
    out[i] = Math.round(x * cos - y * sin);
    out[i + 1] = Math.round(x * sin + y * cos);
  }
  return out;
});

/** Pixels of the centroid disc, as (dx, dy) pairs. */
const DISC: Int8Array = (() => {
  const cells: number[] = [];
  for (let dy = -CENTROID_RADIUS; dy <= CENTROID_RADIUS; dy += 1) for (let dx = -CENTROID_RADIUS; dx <= CENTROID_RADIUS; dx += 1) if (dx * dx + dy * dy <= CENTROID_RADIUS * CENTROID_RADIUS) cells.push(dx, dy);
  return Int8Array.from(cells);
})();

/** Orientation of a corner (radians) from the intensity centroid of the disc around it. */
export function orientation(img: GrayImage, x: number, y: number): number {
  const { width, data } = img;
  let m10 = 0;
  let m01 = 0;
  const base = y * width + x;
  for (let i = 0; i < DISC.length; i += 2) {
    const dx = DISC[i];
    const dy = DISC[i + 1];
    const v = data[base + dy * width + dx];
    m10 += dx * v;
    m01 += dy * v;
  }
  return Math.atan2(m01, m10);
}

export type Described = {
  /** The corners kept (far enough from the border), in the same order as the descriptors. */
  points: Keypoint[];
  angles: Float32Array;
  /** `DESCRIPTOR_WORDS` words per point. */
  descriptors: Uint32Array;
};

/**
 * Rotation-aware binary descriptors (rBRIEF, as in ORB) of corners on a
 * blurred image: each bit compares two pixels of the pattern turned to the
 * corner's orientation.
 */
export function describe(img: GrayImage, keypoints: Keypoint[]): Described {
  const { width, height, data } = img;
  const points = keypoints.filter((k) => k.x >= DESCRIBE_MARGIN && k.y >= DESCRIBE_MARGIN && k.x < width - DESCRIBE_MARGIN && k.y < height - DESCRIBE_MARGIN);
  const descriptors = new Uint32Array(points.length * DESCRIPTOR_WORDS);
  const angles = new Float32Array(points.length);
  points.forEach((k, n) => {
    const angle = orientation(img, k.x, k.y);
    angles[n] = angle;
    let bin = Math.round((angle / (2 * Math.PI)) * ANGLE_BINS) % ANGLE_BINS;
    if (bin < 0) bin += ANGLE_BINS;
    const pattern = ROTATED[bin];
    const base = k.y * width + k.x;
    let word = 0;
    let bits = 0;
    let out = n * DESCRIPTOR_WORDS;
    for (let j = 0; j < PAIRS * 4; j += 4) {
      const a = data[base + pattern[j + 1] * width + pattern[j]];
      const b = data[base + pattern[j + 3] * width + pattern[j + 2]];
      if (a < b) word |= 1 << bits;
      bits += 1;
      if (bits === 32) {
        descriptors[out] = word >>> 0;
        out += 1;
        word = 0;
        bits = 0;
      }
    }
  });
  return { points, angles, descriptors };
}
