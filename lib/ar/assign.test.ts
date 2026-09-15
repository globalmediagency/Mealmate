import { describe, expect, it } from "vitest";
import { pickMarkerId } from "./assign";
import { AR_MARKER, isMarkerId } from "./config";

describe("pickMarkerId", () => {
  it("never returns a taken number while some are free", () => {
    const taken = new Set([0, 1, 2, 3]);
    for (let i = 0; i < 50; i += 1) {
      const id = pickMarkerId(taken, Math.random, 6);
      expect([4, 5]).toContain(id);
    }
    expect(pickMarkerId(new Set([0, 1, 2]), () => 0, 4)).toBe(3);
    expect(pickMarkerId(new Set([0, 1, 2]), () => 0.999, 4)).toBe(3);
  });

  it("falls back to any number when the dictionary is exhausted", () => {
    const taken = new Set([0, 1, 2]);
    expect(pickMarkerId(taken, () => 0.5, 3)).toBe(1);
  });

  it("stays inside the dictionary", () => {
    const id = pickMarkerId(new Set(), () => 0.9999999);
    expect(isMarkerId(id)).toBe(true);
    expect(id).toBe(AR_MARKER.ids - 1);
    expect(isMarkerId(AR_MARKER.ids)).toBe(false);
    expect(isMarkerId(-1)).toBe(false);
    expect(isMarkerId(1.5)).toBe(false);
  });
});
