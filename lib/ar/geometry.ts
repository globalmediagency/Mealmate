/**
 * Pure geometry of the "Voir en vrai" screen (spec § 3.19): from the four
 * corners of the detected marker to where and how big the creature is drawn.
 * Level 1 (billboard): the creature stands upright on the marker's centre,
 * scaled by the marker's apparent size. `angle` and `tilt` are already
 * computed for the multi-view (level 2) and 3D (level 3) renderers.
 */
export type Point = { x: number; y: number };
/** Marker corners in canonical order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Point, Point, Point, Point];

export type MarkerPose = {
  /** Centre of the marker on screen. */
  center: Point;
  /** Mean side length on screen (px): the scale reference. */
  size: number;
  /** Rotation of the marker's top edge in the image plane (radians, 0 = pointing right). */
  angle: number;
  /** Horizontal / vertical extents on screen, for the ground shadow. */
  width: number;
  height: number;
  /** 0 = seen from straight above, → 1 as the camera looks at it edge-on. */
  tilt: number;
};

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export function quadCenter(quad: Quad): Point {
  return { x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4, y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4 };
}

export function markerPose(quad: Quad): MarkerPose {
  const sides = [dist(quad[0], quad[1]), dist(quad[1], quad[2]), dist(quad[2], quad[3]), dist(quad[3], quad[0])];
  const size = sides.reduce((s, v) => s + v, 0) / 4;
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const longest = Math.max(...sides);
  const shortest = Math.min(...sides);
  return {
    center: quadCenter(quad),
    size,
    angle: Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x),
    width,
    height,
    tilt: longest > 0 ? 1 - shortest / longest : 0,
  };
}

export type CoverTransform = { scale: number; offsetX: number; offsetY: number };

/** How a `width × height` video fills a box with `object-fit: cover` (centred). */
export function coverTransform(videoWidth: number, videoHeight: number, boxWidth: number, boxHeight: number): CoverTransform {
  if (videoWidth <= 0 || videoHeight <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  return { scale, offsetX: (boxWidth - videoWidth * scale) / 2, offsetY: (boxHeight - videoHeight * scale) / 2 };
}

export function mapPoint(p: Point, t: CoverTransform): Point {
  return { x: p.x * t.scale + t.offsetX, y: p.y * t.scale + t.offsetY };
}

export function mapQuad(quad: Quad, t: CoverTransform): Quad {
  return [mapPoint(quad[0], t), mapPoint(quad[1], t), mapPoint(quad[2], t), mapPoint(quad[3], t)];
}

/** Exponential smoothing between two poses (`alpha` = weight of the new one, 0–1). */
export function smoothPose(previous: MarkerPose | null, next: MarkerPose, alpha: number): MarkerPose {
  if (!previous) return next;
  const a = Math.max(0, Math.min(1, alpha));
  const mix = (p: number, n: number) => p + (n - p) * a;
  // Angles wrap around: interpolate the shortest way.
  let delta = next.angle - previous.angle;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return {
    center: { x: mix(previous.center.x, next.center.x), y: mix(previous.center.y, next.center.y) },
    size: mix(previous.size, next.size),
    angle: previous.angle + delta * a,
    width: mix(previous.width, next.width),
    height: mix(previous.height, next.height),
    tilt: mix(previous.tilt, next.tilt),
  };
}

/** Creature height on screen for a marker of `size` px: about twice the printed square. */
export const CREATURE_HEIGHT_PER_MARKER = 2.2;
