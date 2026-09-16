import { describe, expect, it } from "vitest";
import { ARENA } from "./config";
import { arenaAimTarget, arenaBonusBlinking, arenaScore, arenaSecondsLeft, placeArenaBonus, rankArenaPlayers } from "./arena";
import { GOOD_FOODS } from "./defense";

const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
};

describe("rankArenaPlayers", () => {
  it("puts survivors first by health then hits, then the others by elimination order", () => {
    const ranks = rankArenaPlayers([
      { userId: "a", alive: true, hp: 40, hitsDealt: 2, outAt: null },
      { userId: "b", alive: false, hp: 0, hitsDealt: 5, outAt: 1_000 },
      { userId: "c", alive: true, hp: 70, hitsDealt: 1, outAt: null },
      { userId: "d", alive: false, hp: 0, hitsDealt: 0, outAt: 5_000 },
    ]);
    expect([...ranks.entries()]).toEqual([
      ["c", 1],
      ["a", 2],
      ["d", 3],
      ["b", 4],
    ]);
  });

  it("shares a rank on an exact tie and skips the next one", () => {
    const ranks = rankArenaPlayers([
      { userId: "a", alive: true, hp: 55, hitsDealt: 3, outAt: null },
      { userId: "b", alive: true, hp: 55, hitsDealt: 3, outAt: null },
      { userId: "c", alive: true, hp: 55, hitsDealt: 2, outAt: null },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(3);
  });
});

describe("arenaScore", () => {
  it("rewards health and rank equally", () => {
    expect(arenaScore(100, 100, 1, 4)).toEqual({ score: 100, perfect: true });
    expect(arenaScore(50, 100, 1, 2)).toEqual({ score: 75, perfect: false });
    expect(arenaScore(0, 100, 4, 4)).toEqual({ score: 0, perfect: false });
    expect(arenaScore(30, 100, 2, 3)).toEqual({ score: 40, perfect: false });
  });

  it("never exceeds the bounds", () => {
    expect(arenaScore(150, 100, 1, 1).score).toBe(100);
    expect(arenaScore(-5, 100, 9, 2).score).toBe(0);
  });
});

describe("placeArenaBonus", () => {
  it("drops a known good food near one of the given creatures, within the distance band", () => {
    const random = seeded(7);
    for (let i = 0; i < 200; i++) {
      const bonus = placeArenaBonus(random, ["u1", "u2", "u3"]);
      expect(bonus).not.toBeNull();
      expect(["u1", "u2", "u3"]).toContain(bonus!.anchorUserId);
      expect(bonus!.heal).toBe(GOOD_FOODS[bonus!.kind].heal);
      const dist = Math.hypot(bonus!.x, bonus!.y);
      expect(dist).toBeGreaterThanOrEqual(ARENA.bonusMinDistance - 1e-9);
      expect(dist).toBeLessThanOrEqual(ARENA.bonusMaxDistance + 1e-9);
    }
  });

  it("returns null when nobody is left to anchor it", () => {
    expect(placeArenaBonus(Math.random, [])).toBeNull();
  });
});

describe("arenaAimTarget", () => {
  it("picks the nearest creature and tells whether the egg touches it", () => {
    const target = arenaAimTarget([
      { userId: "far", x: 1.5, y: 0.2 },
      { userId: "near", x: 0.3, y: -0.2 },
    ]);
    expect(target?.userId).toBe("near");
    expect(target?.hit).toBe(true);
    const miss = arenaAimTarget([{ userId: "a", x: 1.0, y: 0.9 }]);
    expect(miss?.userId).toBe("a");
    expect(miss?.hit).toBe(false);
  });

  it("ignores creatures too far from the aimed point", () => {
    expect(arenaAimTarget([{ userId: "a", x: ARENA.aimMaxRadius + 0.1, y: 0 }])).toBeNull();
    expect(arenaAimTarget([])).toBeNull();
  });
});

describe("timers", () => {
  it("counts whole seconds left and the blinking window", () => {
    expect(arenaSecondsLeft(10_000, 7_400)).toBe(3);
    expect(arenaSecondsLeft(10_000, 12_000)).toBe(0);
    expect(arenaSecondsLeft(null, 0)).toBe(0);
    expect(arenaBonusBlinking(10_000, 10_000 - ARENA.bonusBlinkSeconds * 1000 - 1)).toBe(false);
    expect(arenaBonusBlinking(10_000, 9_000)).toBe(true);
  });
});
