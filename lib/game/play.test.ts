import { describe, expect, it } from "vitest";
import { computePlayScore, playEffects } from "./play";

describe("computePlayScore", () => {
  it("scores the catch ratio and penalises junk", () => {
    expect(computePlayScore({ healthySpawned: 10, healthyCaught: 10, junkHit: 0 })).toEqual({ score: 100, perfect: true });
    expect(computePlayScore({ healthySpawned: 10, healthyCaught: 7, junkHit: 1 })).toEqual({ score: 60, perfect: false });
    expect(computePlayScore({ healthySpawned: 0, healthyCaught: 0, junkHit: 0 })).toEqual({ score: 0, perfect: false });
  });

  it("never trusts more catches than spawns", () => {
    expect(computePlayScore({ healthySpawned: 5, healthyCaught: 50, junkHit: 0 }).score).toBe(100);
    expect(computePlayScore({ healthySpawned: 5, healthyCaught: -2, junkHit: -4 }).score).toBe(0);
  });
});

describe("playEffects", () => {
  it("gives +15 mood, +5 xp, +5 more when perfect", () => {
    expect(playEffects(40)).toEqual({ moodDelta: 15, xpDelta: 5, perfect: false });
    expect(playEffects(100)).toEqual({ moodDelta: 15, xpDelta: 10, perfect: true });
  });
});
