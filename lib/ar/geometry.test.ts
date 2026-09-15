import { describe, expect, it } from "vitest";
import { coverTransform, mapPoint, markerPose, smoothPose, type Quad } from "./geometry";

const square: Quad = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 200 },
  { x: 100, y: 200 },
];

describe("markerPose", () => {
  it("measures the centre, size, angle and extents of an upright square", () => {
    const pose = markerPose(square);
    expect(pose.center).toEqual({ x: 150, y: 150 });
    expect(pose.size).toBe(100);
    expect(pose.angle).toBe(0);
    expect(pose.width).toBe(100);
    expect(pose.height).toBe(100);
    expect(pose.tilt).toBe(0);
  });

  it("reads the in-plane rotation from the top edge and the tilt from the side ratio", () => {
    const rotated: Quad = [
      { x: 150, y: 100 },
      { x: 200, y: 150 },
      { x: 150, y: 200 },
      { x: 100, y: 150 },
    ];
    expect(markerPose(rotated).angle).toBeCloseTo(Math.PI / 4);
    const flat: Quad = [
      { x: 100, y: 140 },
      { x: 200, y: 140 },
      { x: 200, y: 160 },
      { x: 100, y: 160 },
    ];
    expect(markerPose(flat).tilt).toBeCloseTo(0.8);
  });
});

describe("coverTransform / mapPoint", () => {
  it("scales a landscape video to cover a portrait box, centred", () => {
    const t = coverTransform(640, 480, 400, 800);
    expect(t.scale).toBeCloseTo(800 / 480);
    expect(t.offsetY).toBe(0);
    expect(t.offsetX).toBeCloseTo((400 - 640 * (800 / 480)) / 2);
    expect(mapPoint({ x: 320, y: 240 }, t)).toEqual({ x: 200, y: 400 });
  });

  it("is the identity for a degenerate video", () => {
    expect(coverTransform(0, 0, 400, 800)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});

describe("smoothPose", () => {
  it("returns the new pose when there is no previous one and blends otherwise", () => {
    const a = markerPose(square);
    const b = { ...a, center: { x: 250, y: 150 }, size: 200 };
    expect(smoothPose(null, b, 0.5)).toBe(b);
    const mixed = smoothPose(a, b, 0.5);
    expect(mixed.center.x).toBe(200);
    expect(mixed.size).toBe(150);
  });

  it("interpolates angles the short way round", () => {
    const a = { ...markerPose(square), angle: Math.PI - 0.1 };
    const b = { ...a, angle: -Math.PI + 0.1 };
    expect(smoothPose(a, b, 0.5).angle).toBeCloseTo(Math.PI);
  });
});
