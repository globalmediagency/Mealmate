/**
 * Fake 3D turnaround (spec § 3.19, level 2): the flat creature is drawn as
 * if its head and body were spheres, so its features slide, foreshorten and
 * hide as it turns. Eight views, 45° apart; yaw 0 faces the camera and a
 * positive yaw turns the creature clockwise seen from above, its face
 * sliding to the viewer's left. Pure: the renderer applies the placements.
 */
export const VIEW_COUNT = 8;
export const VIEW_STEP_DEG = 360 / VIEW_COUNT;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Yaw (degrees) of a view index, wrapped into 0–7. */
export function yawForView(view: number): number {
  return (((Math.round(view) % VIEW_COUNT) + VIEW_COUNT) % VIEW_COUNT) * VIEW_STEP_DEG;
}

/**
 * The view a marker angle (radians, in-plane rotation on screen) falls in,
 * with hysteresis: the previous view is kept until the angle is `marginDeg`
 * past the boundary, so a paper held near 22.5° does not flicker.
 */
export function viewFromAngle(angleRad: number, previous: number | null, marginDeg = 6): number {
  const deg = (((angleRad * 180) / Math.PI) % 360 + 360) % 360;
  const candidate = Math.round(deg / VIEW_STEP_DEG) % VIEW_COUNT;
  if (previous === null || candidate === previous) return candidate;
  let delta = deg - previous * VIEW_STEP_DEG;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return Math.abs(delta) > VIEW_STEP_DEG / 2 + marginDeg ? candidate : previous;
}

export type Placement = {
  /** Horizontal offset from the sphere's centre, in the drawing's units. */
  x: number;
  /** Horizontal scale relative to the frontal drawing (1 at yaw 0), never below `minSquash`. */
  squash: number;
  /** Facing the camera (features on the far side are hidden). */
  visible: boolean;
  /** −1 (away) … 1 (toward the camera). */
  depth: number;
};

export type TurnOptions = {
  /** The feature sits on the far side of the sphere at yaw 0 (a tail). */
  behind?: boolean;
  /** Floor for `squash` (ears keep some width from every angle). */
  minSquash?: number;
};

/**
 * Where a feature drawn at `dx` from the centre of a sphere of radius `r`
 * ends up once the sphere turns by `yawDeg`. At yaw 0 the feature stays
 * exactly where it was drawn.
 */
export function turnFeature(dx: number, r: number, yawDeg: number, options: TurnOptions = {}): Placement {
  const radius = Math.max(Math.abs(dx), r, 0.001);
  let azimuth = Math.asin(clamp(dx / radius, -1, 1));
  if (options.behind) azimuth = Math.PI - azimuth;
  const base = Math.max(0.05, Math.abs(Math.cos(azimuth)));
  const turned = azimuth - toRad(yawDeg);
  const depth = Math.cos(turned);
  return {
    x: radius * Math.sin(turned),
    depth,
    visible: depth > 0.02,
    squash: clamp(Math.abs(depth) / base, options.minSquash ?? 0.08, 1),
  };
}
