import { describe, expect, it } from "vitest";
import { cameraFovDeg, pickPose, posesFromCorners, rotationDistance, type Pose3d } from "./pose3d";

const W = 1280;
const H = 720;
const F = W;

type Vec = [number, number, number];
const rotX = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return (v: Vec): Vec => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
};
const rotZ = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return (v: Vec): Vec => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
};

function determinant(m: Pose3d["rotation"]): number {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

/** Projects the marker (side 1, corners TL TR BR BL) placed at `t` (POSIT camera frame, z away) after `rotate`, into video pixels. */
function project(t: Vec, rotate: (v: Vec) => Vec = (v) => v) {
  const model: Vec[] = [
    [-0.5, 0.5, 0],
    [0.5, 0.5, 0],
    [0.5, -0.5, 0],
    [-0.5, -0.5, 0],
  ];
  return model.map((p) => {
    const r = rotate(p);
    const c: Vec = [r[0] + t[0], r[1] + t[1], r[2] + t[2]];
    return { x: (F * c[0]) / c[2] + W / 2, y: H / 2 - (F * c[1]) / c[2] };
  });
}

describe("posesFromCorners", () => {
  it("recovers a marker facing the camera 5 sides away", () => {
    const { best } = posesFromCorners(project([0, 0, 5]), W, H);
    expect(best.position[0]).toBeCloseTo(0, 1);
    expect(best.position[1]).toBeCloseTo(0, 1);
    expect(best.position[2]).toBeCloseTo(-5, 1);
    // Marker-local x → camera x, y → y, and z (out of the paper) → toward the viewer (+z): a proper rotation.
    expect(best.rotation[0]).toBeCloseTo(1, 1);
    expect(best.rotation[4]).toBeCloseTo(1, 1);
    expect(best.rotation[8]).toBeCloseTo(1, 1);
    expect(determinant(best.rotation)).toBeCloseTo(1, 1);
  });

  it("sees an in-plane rotation as a rotation about the viewing axis", () => {
    const { best } = posesFromCorners(project([0.6, -0.3, 4], rotZ(90)), W, H);
    expect(best.position[0]).toBeCloseTo(0.6, 1);
    expect(best.position[1]).toBeCloseTo(-0.3, 1);
    // Local x now maps to camera y.
    expect(best.rotation[3]).toBeCloseTo(1, 1);
    expect(best.rotation[1]).toBeCloseTo(-1, 1);
  });

  it("recovers a tilted marker (table seen from a standing viewer) within one of the two solutions", () => {
    const candidates = posesFromCorners(project([0, -0.8, 4], rotX(-55)), W, H);
    const tilt = Math.cos((55 * Math.PI) / 180);
    const ok = [candidates.best, candidates.alternative].some((p) => Math.abs(p.rotation[4] - tilt) < 0.15 && Math.abs(p.position[2] + 4) < 0.5);
    expect(ok).toBe(true);
  });
});

describe("pickPose / cameraFovDeg", () => {
  const identity: Pose3d = { position: [0, 0, -5], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], error: 1 };
  const other: Pose3d = { position: [0, 0, -5], rotation: [1, 0, 0, 0, -1, 0, 0, 0, -1], error: 0.5 };
  it("takes the lowest error at first, then the solution closest to the previous one", () => {
    expect(pickPose({ best: identity, alternative: other }, null)).toBe(other);
    expect(pickPose({ best: other, alternative: identity }, identity)).toBe(identity);
    expect(rotationDistance(identity.rotation, identity.rotation)).toBe(0);
    expect(rotationDistance(identity.rotation, other.rotation)).toBeCloseTo(8);
  });

  it("derives the vertical field of view from the assumed focal length", () => {
    expect(cameraFovDeg(1280, 720)).toBeCloseTo(31.4, 0);
  });
});
