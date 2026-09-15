import { describe, expect, it } from "vitest";
import { turnFeature, VIEW_COUNT, viewFromAngle, yawForView } from "./turnaround";

describe("yawForView", () => {
  it("spaces eight views 45° apart and wraps", () => {
    expect(yawForView(0)).toBe(0);
    expect(yawForView(2)).toBe(90);
    expect(yawForView(7)).toBe(315);
    expect(yawForView(8)).toBe(0);
    expect(yawForView(-1)).toBe(315);
    expect(VIEW_COUNT).toBe(8);
  });
});

describe("viewFromAngle", () => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  it("rounds to the nearest view", () => {
    expect(viewFromAngle(rad(0), null)).toBe(0);
    expect(viewFromAngle(rad(50), null)).toBe(1);
    expect(viewFromAngle(rad(-90), null)).toBe(6);
    expect(viewFromAngle(rad(350), null)).toBe(0);
  });

  it("keeps the previous view until the angle is clearly past the boundary", () => {
    expect(viewFromAngle(rad(24), 0)).toBe(0);
    expect(viewFromAngle(rad(28), 0)).toBe(0);
    expect(viewFromAngle(rad(29), 0)).toBe(1);
    expect(viewFromAngle(rad(-28), 0)).toBe(0);
    expect(viewFromAngle(rad(-29), 0)).toBe(7);
    // Far from the previous view: switch at once.
    expect(viewFromAngle(rad(180), 0)).toBe(4);
  });
});

describe("turnFeature", () => {
  it("leaves the frontal drawing untouched at yaw 0", () => {
    const eye = turnFeature(8.5, 20, 0);
    expect(eye.x).toBeCloseTo(8.5);
    expect(eye.squash).toBe(1);
    expect(eye.visible).toBe(true);
    const tail = turnFeature(16, 21, 0, { behind: true });
    expect(tail.x).toBeCloseTo(16);
    expect(tail.depth).toBeLessThan(0);
  });

  it("slides the face to the viewer's left, hides the far eye at profile and the whole face from behind", () => {
    const left = turnFeature(-8.5, 20, 90);
    const right = turnFeature(8.5, 20, 90);
    expect(left.visible).toBe(false);
    expect(right.visible).toBe(true);
    expect(right.x).toBeLessThan(-15);
    expect(right.squash).toBeGreaterThan(0.3);
    expect(right.squash).toBeLessThan(0.7);
    expect(turnFeature(0, 16, 180).visible).toBe(false);
    expect(turnFeature(0, 16, 45).x).toBeCloseTo(-16 * Math.sin(Math.PI / 4));
  });

  it("brings a tail round to the front on the back view and mirrors its side", () => {
    const back = turnFeature(16, 21, 180, { behind: true });
    expect(back.depth).toBeGreaterThan(0);
    expect(back.x).toBeCloseTo(-16);
    const profile = turnFeature(16, 21, 90, { behind: true });
    expect(profile.depth).toBeGreaterThan(0);
    expect(profile.x).toBeGreaterThan(0);
  });

  it("respects a squash floor and tolerates features drawn outside the sphere", () => {
    expect(turnFeature(14, 23, 45, { minSquash: 0.45 }).squash).toBeGreaterThanOrEqual(0.45);
    const wide = turnFeature(30, 20, 0);
    expect(wide.x).toBeCloseTo(30);
  });
});
