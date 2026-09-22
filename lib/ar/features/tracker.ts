import { detectFast, selectSpread, type Keypoint } from "./fast";
import { fitHomography, isSaneQuad, projectedQuad, ransacHomography, type Quad } from "./homography";
import { PHOTO_MARKER } from "../config";
import { blur, centreSquare, crop, halve, padImage, resample, type GrayImage, type Mat3, type Point } from "./image";
import { matchDescriptors, type Match } from "./match";
import { describe, DESCRIBE_MARGIN, DESCRIPTOR_WORDS } from "./orb";

/**
 * Photo markers (spec § 3.19): a picture of anything (a pen drawing on a
 * sheet, a hand) recognised in the camera image instead of a printed tag.
 * The reference is described once at several scales and vertical squeezes
 * (the paper is usually seen at an angle); every frame, its corners are
 * described the same way, matched, and a RANSAC homography projects the
 * reference square into the frame. Corners come back in the same order as
 * a printed marker's (top-left, top-right, bottom-right, bottom-left), so
 * the pose pipeline does not know the difference.
 */

/** Side (px) of the square the reference is resampled to: positions are expressed in these units. */
export const REFERENCE_SIZE = 256;
/** Scales of the reference pyramid (the target may look smaller than the reference)… */
const SCALES = [1, 0.7, 0.5, 0.35, 0.25] as const;
/** …and vertical squeezes (the paper seen from an angle). */
const SQUEEZES = [1, 0.6] as const;
const MIN_LEVEL_PX = 48;
const FAST_THRESHOLD = 20;
/** References only: a picture with few corners at 20 is retried at this threshold (never a camera frame, where it floods the budget with noise). */
const FAST_FALLBACK_THRESHOLD = 10;
/**
 * The frame is described at these scales too, so a picture seen LARGER than
 * its reference (the phone closer than when the photo was taken) is still
 * matched: the half and quarter frames cover targets up to about 3 × the
 * reference. Each level keeps at most `max` corners.
 */
export const FRAME_LEVELS: readonly { scale: number; max: number }[] = [
  { scale: 1, max: 400 },
  { scale: 0.5, max: 250 },
  { scale: 0.25, max: 120 },
];
const MIN_FRAME_LEVEL_PX = 48;
/** Whole-frame searches stop RANSAC earlier than the default: absent pictures still cost every iteration. */
const SEARCH_MAX_ITERATIONS = 300;

export type Reference = {
  size: number;
  count: number;
  descriptors: Uint32Array;
  /** Interleaved x / y of each described corner, in reference units (0 … `size`). */
  positions: Float32Array;
  /** Orientation (radians) and pyramid scale of each described corner, for the agreement filter. */
  angles: Float32Array;
  scales: Float32Array;
  /** Corners found at the base scale: the picture's richness in detail. */
  keypoints: number;
};

export type ReferenceOptions = { maxPerLevel?: number; threshold?: number; scales?: readonly number[]; squeezes?: readonly number[] };

function corners(img: GrayImage, threshold: number, max: number, fallback: boolean): Keypoint[] {
  let points = detectFast(img, threshold, DESCRIBE_MARGIN);
  if (fallback && points.length < max / 2 && threshold > FAST_FALLBACK_THRESHOLD) points = detectFast(img, FAST_FALLBACK_THRESHOLD, DESCRIBE_MARGIN);
  return selectSpread(points, img.width, img.height, max);
}

/** The picture as the tracker keeps it: a `REFERENCE_SIZE` square, centre-cropped if needed. */
export function referenceImage(img: GrayImage): GrayImage {
  const square = centreSquare(img);
  return square.width === REFERENCE_SIZE ? square : resample(square, REFERENCE_SIZE, REFERENCE_SIZE);
}

/** Describes a photo at every scale and squeeze; ready to be looked for in frames. */
export function buildReference(img: GrayImage, options: ReferenceOptions = {}): Reference {
  const maxPerLevel = options.maxPerLevel ?? 200;
  const threshold = options.threshold ?? FAST_THRESHOLD;
  const levelScales = options.scales ?? SCALES;
  const squeezes = options.squeezes ?? SQUEEZES;
  const base = referenceImage(img);
  const chunks: { descriptors: Uint32Array; positions: Float32Array; angles: Float32Array; scale: number; count: number }[] = [];
  let keypoints = 0;
  for (const scale of levelScales) {
    for (const squeeze of squeezes) {
      const w = Math.round(REFERENCE_SIZE * scale);
      const h = Math.round(REFERENCE_SIZE * scale * squeeze);
      if (w < MIN_LEVEL_PX || h < MIN_LEVEL_PX) continue;
      const level = scale === 1 && squeeze === 1 ? base : resample(base, w, h);
      // Padded with its own edge pixels so the corners near the border (most of a small level) can be described too.
      const padded = padImage(level, DESCRIBE_MARGIN);
      const described = describe(blur(padded), corners(padded, threshold, maxPerLevel, true));
      if (scale === 1 && squeeze === 1) keypoints = described.points.length;
      const positions = new Float32Array(described.points.length * 2);
      described.points.forEach((p, i) => {
        positions[2 * i] = ((p.x - DESCRIBE_MARGIN) * REFERENCE_SIZE) / w;
        positions[2 * i + 1] = ((p.y - DESCRIBE_MARGIN) * REFERENCE_SIZE) / h;
      });
      chunks.push({ descriptors: described.descriptors, positions, angles: described.angles, scale, count: described.points.length });
    }
  }
  const count = chunks.reduce((s, c) => s + c.count, 0);
  const descriptors = new Uint32Array(count * DESCRIPTOR_WORDS);
  const positions = new Float32Array(count * 2);
  const angles = new Float32Array(count);
  const scales = new Float32Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    descriptors.set(chunk.descriptors, offset * DESCRIPTOR_WORDS);
    positions.set(chunk.positions, offset * 2);
    angles.set(chunk.angles, offset);
    scales.fill(chunk.scale, offset, offset + chunk.count);
    offset += chunk.count;
  }
  return { size: REFERENCE_SIZE, count, descriptors, positions, angles, scales, keypoints };
}

export type QualityLevel = "poor" | "fair" | "good";
export type ReferenceQuality = { keypoints: number; level: QualityLevel };

/** Whether a picture has enough detail to be recognised (a plain hand rarely has; a contrasted drawing does). */
export function referenceQuality(img: GrayImage): ReferenceQuality {
  const base = padImage(referenceImage(img), DESCRIBE_MARGIN);
  const keypoints = describe(blur(base), detectFast(base, FAST_THRESHOLD, DESCRIBE_MARGIN)).points.length;
  return { keypoints, level: keypoints < PHOTO_MARKER.minKeypoints ? "poor" : keypoints < PHOTO_MARKER.goodKeypoints ? "fair" : "good" };
}

export type FrameFeatures = {
  width: number;
  height: number;
  points: Keypoint[];
  descriptors: Uint32Array;
  count: number;
  /** Interleaved x / y in full-frame pixels. */
  positions: Float32Array;
  /** Orientation (radians) and pyramid scale of each corner, for the agreement filter. */
  angles: Float32Array;
  scales: Float32Array;
};

export type Region = { x: number; y: number; width: number; height: number };

export type DetectOptions = {
  /** Frame pyramid: scales (each half of the previous one) and their corner budgets; `FRAME_LEVELS` by default. */
  levels?: readonly { scale: number; max: number }[];
  threshold?: number;
  minInliers?: number;
  /** Matches under this count are not worth a RANSAC (absent pictures still produce a few spurious ones). */
  minMatches?: number;
  /** Reprojection tolerance in frame pixels. */
  reprojection?: number;
  maxIterations?: number;
  random?: () => number;
  /** Only this part of the frame is described (positions stay in frame coordinates): cheap tracking around the last place a photo was seen. */
  region?: Region;
};

/**
 * Corners and descriptors of a frame (or of a region of it) at every scale of
 * the pyramid, positions in full-frame pixels, computed once and matched
 * against every reference. Frames never use the low FAST threshold: on a real
 * picture it would bury the target under noise corners.
 */
export function extractFeatures(frame: GrayImage, options: DetectOptions = {}): FrameFeatures {
  const levels = options.levels ?? FRAME_LEVELS;
  const threshold = options.threshold ?? FAST_THRESHOLD;
  const part = options.region ? crop(frame, options.region.x, options.region.y, options.region.width, options.region.height) : { ...frame, x: 0, y: 0 };
  const chunks: { descriptors: Uint32Array; positions: Float32Array; angles: Float32Array; scale: number; points: Keypoint[] }[] = [];
  let image: GrayImage = part;
  let scale = 1;
  for (const level of levels) {
    while (scale > level.scale + 1e-9) {
      image = halve(image);
      scale /= 2;
    }
    if (Math.abs(scale - level.scale) > 1e-9) {
      image = resample(part, Math.max(1, Math.round(part.width * level.scale)), Math.max(1, Math.round(part.height * level.scale)));
      scale = level.scale;
    }
    if (image.width < MIN_FRAME_LEVEL_PX || image.height < MIN_FRAME_LEVEL_PX) break;
    const described = describe(blur(image), corners(image, threshold, level.max, false));
    const positions = new Float32Array(described.points.length * 2);
    const points = described.points.map((p, i) => {
      const x = p.x / scale + part.x;
      const y = p.y / scale + part.y;
      positions[2 * i] = x;
      positions[2 * i + 1] = y;
      return { x, y, score: p.score };
    });
    chunks.push({ descriptors: described.descriptors, positions, angles: described.angles, scale, points });
  }
  const count = chunks.reduce((s, c) => s + c.points.length, 0);
  const descriptors = new Uint32Array(count * DESCRIPTOR_WORDS);
  const positions = new Float32Array(count * 2);
  const angles = new Float32Array(count);
  const scales = new Float32Array(count);
  const points: Keypoint[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    descriptors.set(chunk.descriptors, offset * DESCRIPTOR_WORDS);
    positions.set(chunk.positions, offset * 2);
    angles.set(chunk.angles, offset);
    scales.fill(chunk.scale, offset, offset + chunk.points.length);
    points.push(...chunk.points);
    offset += chunk.points.length;
  }
  return { width: frame.width, height: frame.height, points, descriptors, count, positions, angles, scales };
}

/** Rotation bins of the agreement filter (30° each) and the width of its scale bins (octaves). */
const ROTATION_BINS = 12;
const SCALE_BIN_OCTAVES = 0.5;
const SCALE_MIN_OCTAVES = -3;
const SCALE_BINS = 13;

/**
 * Keeps the matches that agree on one in-plane rotation and one apparent
 * scale (a Hough vote, as SIFT does): true matches of a rigid picture all
 * share them, matches on the clutter around are spread over the bins. The
 * winning cell and its neighbours are kept; with too few agreeing matches,
 * everything is returned for RANSAC to sort out.
 */
export function consistentMatches(matches: readonly Match[], features: FrameFeatures, ref: Reference, minKept = 8): Match[] {
  if (matches.length < minKept) return [...matches];
  const rot = new Int32Array(matches.length);
  const sc = new Int32Array(matches.length);
  const votes = new Int32Array(ROTATION_BINS * SCALE_BINS);
  const twoPi = 2 * Math.PI;
  matches.forEach((m, i) => {
    let d = (features.angles[m.query] - ref.angles[m.train]) % twoPi;
    if (d < 0) d += twoPi;
    rot[i] = Math.min(ROTATION_BINS - 1, Math.floor((d / twoPi) * ROTATION_BINS));
    const octaves = Math.log2(ref.scales[m.train] / features.scales[m.query]);
    sc[i] = Math.max(0, Math.min(SCALE_BINS - 1, Math.round((octaves - SCALE_MIN_OCTAVES) / SCALE_BIN_OCTAVES)));
    votes[rot[i] * SCALE_BINS + sc[i]] += 1;
  });
  let best = -1;
  let bestRot = 0;
  let bestScale = 0;
  for (let r = 0; r < ROTATION_BINS; r += 1) {
    for (let c = 0; c < SCALE_BINS; c += 1) {
      let sum = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        const rr = (r + dr + ROTATION_BINS) % ROTATION_BINS;
        for (let dc = -1; dc <= 1; dc += 1) {
          const cc = c + dc;
          if (cc >= 0 && cc < SCALE_BINS) sum += votes[rr * SCALE_BINS + cc];
        }
      }
      if (sum > best) {
        best = sum;
        bestRot = r;
        bestScale = c;
      }
    }
  }
  if (best < minKept) return [...matches];
  return matches.filter((_, i) => {
    const dr = Math.abs(rot[i] - bestRot);
    return Math.min(dr, ROTATION_BINS - dr) <= 1 && Math.abs(sc[i] - bestScale) <= 1;
  });
}

/** Where to look for a photo next frame: its last quad grown by `margin` (fraction of its size), at least the descriptor margin. */
export function regionAround(quad: Quad, margin = 0.4): Region {
  const xs = quad.map((c) => c.x);
  const ys = quad.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max(DESCRIBE_MARGIN * 2, (maxX - minX) * margin);
  const padY = Math.max(DESCRIBE_MARGIN * 2, (maxY - minY) * margin);
  return { x: minX - padX, y: minY - padY, width: maxX - minX + 2 * padX, height: maxY - minY + 2 * padY };
}

export type Detection = { corners: Quad; H: Mat3; inliers: number; matches: number };

/** Looks for one reference among the frame's features; null when it is not there (or not confidently). */
export function findReference(features: FrameFeatures, ref: Reference, options: DetectOptions = {}): Detection | null {
  const minInliers = options.minInliers ?? 12;
  const minMatches = Math.max(minInliers, options.minMatches ?? 16);
  if (features.count < minInliers || ref.count < minInliers) return null;
  const all = matchDescriptors(features.descriptors, features.count, ref.descriptors, ref.count, ref.positions, { sameSpot: ref.size * 0.04 });
  if (all.length < minMatches) return null;
  const agreeing = consistentMatches(all, features, ref);
  const matches = agreeing.length >= minMatches ? agreeing : all;
  const src = new Float32Array(matches.length * 2);
  const dst = new Float32Array(matches.length * 2);
  matches.forEach((m, i) => {
    src[2 * i] = ref.positions[2 * m.train];
    src[2 * i + 1] = ref.positions[2 * m.train + 1];
    dst[2 * i] = features.positions[2 * m.query];
    dst[2 * i + 1] = features.positions[2 * m.query + 1];
  });
  const result = ransacHomography(src, dst, matches.length, { threshold: options.reprojection ?? 4, minInliers, maxIterations: options.maxIterations ?? SEARCH_MAX_ITERATIONS, random: options.random });
  if (!result) return null;
  const quad = projectedQuad(result.H, ref.size);
  if (!quad || !isSaneQuad(quad)) return null;
  return { corners: quad, H: result.H, inliers: result.inliers.length, matches: all.length };
}

/** Every reference looked for in one frame (features extracted once). */
export function detectReferences(frame: GrayImage, refs: readonly Reference[], options: DetectOptions = {}): (Detection | null)[] {
  if (refs.length === 0) return [];
  const features = extractFeatures(frame, options);
  return refs.map((ref) => findReference(features, ref, options));
}

/** Homography sending the reference square onto a quad (for tests and previews). */
export function homographyToQuad(size: number, quad: Quad): Mat3 | null {
  const src = Float32Array.of(0, 0, size, 0, size, size, 0, size);
  const dst = Float32Array.of(quad[0].x, quad[0].y, quad[1].x, quad[1].y, quad[2].x, quad[2].y, quad[3].x, quad[3].y);
  return fitHomography(src, dst, [0, 1, 2, 3]);
}

export { grayFromRgba, halve } from "./image";
export type { GrayImage, Point, Quad };
