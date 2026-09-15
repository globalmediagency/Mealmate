import { POS } from "./vendor/posit1.js";

/**
 * Full 3D pose of a marker from its four corners (spec § 3.19, level 3),
 * through POSIT (coplanar variant, vendored from js-aruco2). Units: the
 * marker's side is 1. Axes follow Three.js: x right, y up, z toward the
 * viewer, so a marker in front of the camera has a negative z.
 */
export type Pose3d = {
  position: [number, number, number];
  /** Row-major 3×3 rotation mapping marker-local axes (x right, y toward the top edge, z out of the paper toward the reader) to camera axes. */
  rotation: [number, number, number, number, number, number, number, number, number];
  /** Reprojection error reported by POSIT (pixels); lower is better. */
  error: number;
};

export type PoseCandidates = { best: Pose3d; alternative: Pose3d };

type Corner = { x: number; y: number };

/** Focal length (px) assumed for a phone camera: about a 53° horizontal field of view. */
export function focalLengthFor(videoWidth: number): number {
  return videoWidth;
}

/** Vertical field of view (degrees) of a virtual camera reproducing that focal length. */
export function cameraFovDeg(videoWidth: number, videoHeight: number, focal = focalLengthFor(videoWidth)): number {
  return (2 * Math.atan(videoHeight / (2 * focal)) * 180) / Math.PI;
}

let cached: { focal: number; posit: InstanceType<typeof POS.Posit> } | null = null;
function positFor(focal: number) {
  if (!cached || cached.focal !== focal) cached = { focal, posit: new POS.Posit(1, focal) };
  return cached.posit;
}

function convert(rotation: number[][], translation: number[], error: number): Pose3d {
  // POSIT's camera looks down +z and its model's z points into the paper; Three.js looks down −z
  // and the marker's z points out of it. Flipping z on both sides keeps a proper rotation (det +1).
  const [r0, r1, r2] = rotation;
  return {
    position: [translation[0], translation[1], -translation[2]],
    rotation: [r0[0], r0[1], -r0[2], r1[0], r1[1], -r1[2], -r2[0], -r2[1], r2[2]],
    error,
  };
}

/**
 * Both POSIT solutions for a marker whose corners (top-left, top-right,
 * bottom-right, bottom-left) are given in video pixels, y down.
 */
export function posesFromCorners(corners: readonly Corner[], videoWidth: number, videoHeight: number): PoseCandidates {
  const posit = positFor(focalLengthFor(videoWidth));
  const centred = corners.slice(0, 4).map((c) => ({ x: c.x - videoWidth / 2, y: videoHeight / 2 - c.y }));
  const pose = posit.pose(centred);
  return {
    best: convert(pose.bestRotation, pose.bestTranslation, pose.bestError),
    alternative: convert(pose.alternativeRotation, pose.alternativeTranslation, pose.alternativeError),
  };
}

/** Sum of squared differences between two rotations (0 = identical, 12 = opposite). */
export function rotationDistance(a: Pose3d["rotation"], b: Pose3d["rotation"]): number {
  let d = 0;
  for (let i = 0; i < 9; i += 1) d += (a[i] - b[i]) ** 2;
  return d;
}

/**
 * The candidate to keep: the one closest to the previous pose when there is
 * one (coplanar POSIT has two mirror solutions that would otherwise flip),
 * otherwise the one with the lowest error.
 */
export function pickPose(candidates: PoseCandidates, previous: Pose3d | null): Pose3d {
  if (!previous) return candidates.best.error <= candidates.alternative.error ? candidates.best : candidates.alternative;
  const dBest = rotationDistance(candidates.best.rotation, previous.rotation);
  const dAlt = rotationDistance(candidates.alternative.rotation, previous.rotation);
  return dAlt + 0.05 < dBest ? candidates.alternative : candidates.best;
}
