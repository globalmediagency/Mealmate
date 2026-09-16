import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, gameRulesPatchSchema, mergeRules, rulesFromDocument, simulateNeglect } from "./rules";

describe("rules", () => {
  it("defaults mirror the config constants", () => {
    expect(DEFAULT_RULES.tiers.facile.hatchSteps).toBe(15_000);
    expect(DEFAULT_RULES.tiers.difficile.sickDaysBeforeDeath).toBe(3);
    expect(DEFAULT_RULES.hungerDamageThreshold).toBe(80);
    expect(DEFAULT_RULES.feeding.maxMealsPerDay).toBe(5);
    expect(DEFAULT_RULES.tiers.moyen.boardingMaxDays).toBe(30);
    expect(DEFAULT_RULES.boarding).toEqual({ maxPerHost: 5, cooldownMultiplier: 1 });
    expect(DEFAULT_RULES.coaching).toEqual({ thumbsPerStudentReward: 5, thumbsPerCoachReward: 10 });
    expect(DEFAULT_RULES.feeding.mealRetentionDays).toBe(30);
    expect(DEFAULT_RULES.mood).toEqual({ happyMin: 70, xpBonusPercent: 25, lowMax: 30, xpMalusPercent: 25, gloomyMax: 20, healthLossPerHourWhenGloomy: 0.5, chestStepsBonusPercent: 10 });
    expect(DEFAULT_RULES.defense).toEqual({ hp: 100, baseSpeed: 0.32, speedGrowthPercent: 12, firstWaveEnemies: 5, enemiesGrowthPerWave: 2, fireCooldownMs: 350 });
  });

  it("tunes the defense rules", () => {
    const rules = mergeRules({ defense: { hp: 60, fireCooldownMs: 0 } });
    expect(rules.defense).toMatchObject({ hp: 60, fireCooldownMs: 0, baseSpeed: 0.32 });
    expect(gameRulesPatchSchema.safeParse({ defense: { hp: 5 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ defense: { baseSpeed: "0.5" } }).success).toBe(true);
  });

  it("tunes the mood rules", () => {
    const rules = mergeRules({ mood: { happyMin: 60, chestStepsBonusPercent: 0 } });
    expect(rules.mood).toMatchObject({ happyMin: 60, chestStepsBonusPercent: 0, xpBonusPercent: 25 });
    expect(gameRulesPatchSchema.safeParse({ mood: { xpMalusPercent: 150 } }).success).toBe(false);
  });

  it("tunes the boarding rules", () => {
    const rules = mergeRules({ tiers: { difficile: { boardingMaxDays: 7 } }, boarding: { cooldownMultiplier: 2.5 } });
    expect(rules.tiers.difficile.boardingMaxDays).toBe(7);
    expect(rules.tiers.facile.boardingMaxDays).toBe(30);
    expect(rules.boarding).toEqual({ maxPerHost: 5, cooldownMultiplier: 2.5 });
    expect(gameRulesPatchSchema.safeParse({ boarding: { maxPerHost: -1 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ tiers: { facile: { boardingMaxDays: 400 } } }).success).toBe(false);
  });

  it("merges a partial patch over the defaults", () => {
    const rules = mergeRules({ tiers: { moyen: { hungerPerHour: 5 } }, feeding: { maxMealsPerDay: 8 } });
    expect(rules.tiers.moyen.hungerPerHour).toBe(5);
    expect(rules.tiers.moyen.sickDaysBeforeDeath).toBe(5);
    expect(rules.tiers.facile).toEqual(DEFAULT_RULES.tiers.facile);
    expect(rules.feeding.maxMealsPerDay).toBe(8);
  });

  it("validates ranges and coerces numbers from strings", () => {
    const ok = gameRulesPatchSchema.safeParse({ tiers: { facile: { hatchSteps: "12000" } } });
    expect(ok.success && ok.data.tiers?.facile?.hatchSteps).toBe(12_000);
    expect(gameRulesPatchSchema.safeParse({ tiers: { facile: { hatchSteps: 5 } } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ hungerDamageThreshold: 150 }).success).toBe(false);
  });

  it("falls back to defaults for an invalid document", () => {
    expect(rulesFromDocument({ tiers: { facile: { hungerPerHour: -3 } } })).toEqual(DEFAULT_RULES);
    expect(rulesFromDocument("garbage")).toEqual(DEFAULT_RULES);
    expect(rulesFromDocument(null)).toEqual(DEFAULT_RULES);
  });
});

describe("simulateNeglect", () => {
  it("matches the documented timelines", () => {
    const facile = simulateNeglect(DEFAULT_RULES, "facile");
    expect(facile.hoursToStarving).toBe(40);
    expect(facile.hoursToSick).toBe(40 + 140);
    expect(facile.daysToDeath).toBeCloseTo(7.5 + 7, 5);
    const difficile = simulateNeglect(DEFAULT_RULES, "difficile");
    expect(difficile.hoursToStarving).toBe(20);
    expect(difficile.daysToDeath).toBeCloseTo((20 + 70 / 1.5) / 24 + 3, 5);
  });

  it("never dies when losses are zero", () => {
    const rules = mergeRules({ tiers: { facile: { healthLossPerHourWhenStarving: 0 } } });
    expect(simulateNeglect(rules, "facile").daysToDeath).toBe(Number.POSITIVE_INFINITY);
  });
});
