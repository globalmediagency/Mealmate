import { describe, expect, it } from "vitest";
import { mealEffects } from "./meal-effects";

describe("mealEffects", () => {
  it("follows the formula (score − threshold) / 4 clamped to [−15, +12]", () => {
    expect(mealEffects({ score: 82, tier: "facile", hunger: 50 })).toMatchObject({ healthDelta: 10.5, healthy: true, xpDelta: 15 });
    expect(mealEffects({ score: 100, tier: "facile", hunger: 50 }).healthDelta).toBe(12);
    expect(mealEffects({ score: 0, tier: "difficile", hunger: 50 }).healthDelta).toBe(-15);
    expect(mealEffects({ score: 55, tier: "moyen", hunger: 50 })).toMatchObject({ healthDelta: 0, healthy: true });
    expect(mealEffects({ score: 50, tier: "moyen", hunger: 50 })).toMatchObject({ healthDelta: -1.2, healthy: false, xpDelta: 10 });
  });

  it("halves the health effect when the creature is already full", () => {
    const effects = mealEffects({ score: 82, tier: "facile", hunger: 10 });
    expect(effects.full).toBe(true);
    expect(effects.healthDelta).toBe(5.3);
  });

  it("always reduces hunger by 40 and raises mood by 5", () => {
    const effects = mealEffects({ score: 30, tier: "facile", hunger: 90 });
    expect(effects.hungerDelta).toBe(-40);
    expect(effects.moodDelta).toBe(5);
  });
});
