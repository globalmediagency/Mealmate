import { detectFast, selectSpread, type Keypoint } from "./fast";
import { fitHomography, isSaneQuad, projectedQuad, ransacHomography, type Quad } from "./homography";
import { PHOTO_MARKER } from "../config";
import { blur, centreSquare, crop, resample, type GrayImage, type Mat3, type Point } from "./image";
import { matchDescriptors } from "./match";
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
const FAST_FALLBACK_THRESHOLD = 10;

export type Reference = {
  size: number;
  count: number;
  descriptors: Uint32Array;
  /** Interleaved x / y of each described corner, in reference units (0 … `size`). */
  positions: Float32Array;
  /** Corners found at the base scale: the picture's richness in detail. */
  keypoints: number;
};

export type ReferenceOptions = { maxPerLevel?: number; threshold?: number; scales?: readonly number[]; squeezes?: readonly number[] };

function corners(img: GrayImage, threshold: number, max: number): Keypoint[] {
  let points = detectFast(img, threshold, DESCRIBE_MARGIN);
  if (points.length < max / 2 && threshold > FAST_FALLBACK_THRESHOLD) points = detectFast(img, FAST_FALLBACK_THRESHOLD, DESCRIBE_MARGIN);
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
  const scales = options.scales ?? SCALES;
  const squeezes = options.squeezes ?? SQUEEZES;
  const base = referenceImage(img);
  const chunks: { descriptors: Uint32Array; positions: Float32Array; count: number }[] = [];
  let keypoints = 0;
  for (const scale of scales) {
    for (const squeeze of squeezes) {
      const w = Math.round(REFERENCE_SIZE * scale);
      const h = Math.round(REFERENCE_SIZE * scale * squeeze);
      if (w < MIN_LEVEL_PX || h < MIN_LEVEL_PX) continue;
      const level = scale === 1 && squeeze === 1 ? base : resample(base, w, h);
      const described = describe(blur(level), corners(level, threshold, maxPerLevel));
      if (scale === 1 && squeeze === 1) keypoints = described.points.length;
      const positions = new Float32Array(described.points.length * 2);
      described.points.forEach((p, i) => {
        positions[2 * i] = (p.x * REFERENCE_SIZE) / w;
        positions[2 * i + 1] = (p.y * REFERENCE_SIZE) / h;
      });
      chunks.push({ descriptors: described.descriptors, positions, count: described.points.length });
    }
  }
  const count = chunks.reduce((s, c) => s + c.count, 0);
  const descriptors = new Uint32Array(count * DESCRIPTOR_WORDS);
  const positions = new Float32Array(count * 2);
  let offset = 0;
  for (const chunk of chunks) {
    descriptors.set(chunk.descriptors, offset * DESCRIPTOR_WORDS);
    positions.set(chunk.positions, offset * 2);
    offset += chunk.count;
  }
  return { size: REFERENCE_SIZE, count, descriptors, positions, keypoints };
}

export type QualityLevel = "poor" | "fair" | "good";
export type ReferenceQuality = { keypoints: number; level: QualityLevel };

/** Whether a picture has enough detail to be recognised (a plain hand rarely has; a contrasted drawing does). */
export function referenceQuality(img: GrayImage): ReferenceQuality {
  const base = referenceImage(img);
  const keypoints = describe(blur(base), detectFast(base, FAST_THRESHOLD, DESCRIBE_MARGIN)).points.length;
  return { keypoints, level: keypoints < PHOTO_MARKER.minKeypoints ? "poor" : keypoints < PHOTO_MARKER.goodKeypoints ? "fair" : "good" };
}

export type FrameFeatures = { width: number; height: number; points: Keypoint[]; descriptors: Uint32Array; count: number; positions: Float32Array };

export type Region = { x: number; y: number; width: number; height: number };

export type DetectOptions = {
  maxKeypoints?: number;
  threshold?: number;
  minInliers?: number;
  /** Reprojection tolerance in frame pixels. */
  reprojection?: number;
  random?: () => number;
  /** Only this part of the frame is described (positions stay in frame coordinates): cheap tracking around the last place a photo was seen. */
  region?: Region;
};

/** Corners and descriptors of a frame (or of a region of it), computed once and matched against every reference. */
export function extractFeatures(frame: GrayImage, options: DetectOptions = {}): FrameFeatures {
  const max = options.maxKeypoints ?? 500;
  const part = options.region ? crop(frame, options.region.x, options.region.y, options.region.width, options.region.height) : { ...frame, x: 0, y: 0 };
  const described = describe(blur(part), corners(part, options.threshold ?? FAST_THRESHOLD, max));
  const positions = new Float32Array(described.points.length * 2);
  const points = described.points.map((p, i) => {
    positions[2 * i] = p.x + part.x;
    positions[2 * i + 1] = p.y + part.y;
    return { x: p.x + part.x, y: p.y + part.y, score: p.score };
  });
  return { width: frame.width, height: frame.height, points, descriptors: described.descriptors, count: points.length, positions };
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
  if (features.count < minInliers || ref.count < minInliers) return null;
  const matches = matchDescriptors(features.descriptors, features.count, ref.descriptors, ref.count, ref.positions, { sameSpot: ref.size * 0.04 });
  if (matches.length < minInliers) return null;
  const src = new Float32Array(matches.length * 2);
  const dst = new Float32Array(matches.length * 2);
  matches.forEach((m, i) => {
    src[2 * i] = ref.positions[2 * m.train];
    src[2 * i + 1] = ref.positions[2 * m.train + 1];
    dst[2 * i] = features.positions[2 * m.query];
    dst[2 * i + 1] = features.positions[2 * m.query + 1];
  });
  const result = ransacHomography(src, dst, matches.length, { threshold: options.reprojection ?? 4, minInliers, random: options.random });
  if (!result) return null;
  const quad = projectedQuad(result.H, ref.size);
  if (!quad || !isSaneQuad(quad)) return null;
  return { corners: quad, H: result.H, inliers: result.inliers.length, matches: matches.length };
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
