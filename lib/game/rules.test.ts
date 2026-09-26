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
    expect(DEFAULT_RULES.play).toEqual({ maxPerDay: 3 });
    expect(DEFAULT_RULES.arena).toEqual({ hp: 100, eggDamage: 15, durationSeconds: 180, webrtc: false });
    expect(DEFAULT_RULES.defense).toEqual({ hp: 100, baseSpeed: 0.32, speedGrowthPercent: 12, firstWaveEnemies: 5, enemiesGrowthPerWave: 2, fireCooldownMs: 350, bossEveryWaves: 3, bossHits: 3, spawnDistance: 2.8 });
  });

  it("tunes the defense rules", () => {
    const rules = mergeRules({ defense: { hp: 60, fireCooldownMs: 0 } });
    expect(rules.defense).toMatchObject({ hp: 60, fireCooldownMs: 0, baseSpeed: 0.32 });
    expect(gameRulesPatchSchema.safeParse({ defense: { hp: 5 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ defense: { baseSpeed: "0.5" } }).success).toBe(true);
    expect(gameRulesPatchSchema.safeParse({ defense: { bossHits: 0 } }).success).toBe(false);
    expect(mergeRules({ defense: { bossEveryWaves: 0 } }).defense.bossEveryWaves).toBe(0);
    expect(mergeRules({ play: { maxPerDay: 5 } }).play.maxPerDay).toBe(5);
    expect(gameRulesPatchSchema.safeParse({ play: { maxPerDay: 0 } }).success).toBe(false);
    expect(mergeRules({ arena: { webrtc: true, durationSeconds: 60 } }).arena).toEqual({ hp: 100, eggDamage: 15, durationSeconds: 60, webrtc: true });
    expect(DEFAULT_RULES.pingpong).toEqual({ pointsToWin: 7, firstFlightMs: 2200, minFlightMs: 550, paceFactor: 0.9, goodWindowPercent: 15, perfectWindowPercent: 6, ringHideAfterHits: 6, lobFactor: 1.5, smashFactor: 0.7 });
    expect(mergeRules({ pingpong: { pointsToWin: 11, ringHideAfterHits: 0 } }).pingpong).toMatchObject({ pointsToWin: 11, ringHideAfterHits: 0, minFlightMs: 550 });
    expect(gameRulesPatchSchema.safeParse({ pingpong: { minFlightMs: 100 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ pingpong: { paceFactor: "0,9".replace(",", ".") } }).success).toBe(true);
    expect(gameRulesPatchSchema.safeParse({ pingpong: { smashFactor: 1.5 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ arena: { durationSeconds: 5 } }).success).toBe(false);
  });

  it("tunes the AR scene (creature height on the marker) and where foods appear", () => {
    expect(DEFAULT_RULES.ar).toEqual({ creatureHeight: 2.2 });
    expect(mergeRules({ ar: { creatureHeight: 3 } }).ar.creatureHeight).toBe(3);
    expect(mergeRules({ defense: { spawnDistance: 4 } }).defense).toMatchObject({ spawnDistance: 4, hp: 100 });
    expect(gameRulesPatchSchema.safeParse({ ar: { creatureHeight: 0.1 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ defense: { spawnDistance: 20 } }).success).toBe(false);
  });

  it("tunes the home screen (creature size and bounces)", () => {
    expect(DEFAULT_RULES.home).toEqual({ creatureSize: 220, bounce: 0.85, floorBounce: 0.65 });
    expect(mergeRules({ home: { creatureSize: 260 } }).home).toEqual({ creatureSize: 260, bounce: 0.85, floorBounce: 0.65 });
    expect(gameRulesPatchSchema.safeParse({ home: { bounce: 1.2 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ home: { creatureSize: 50 } }).success).toBe(false);
    expect(gameRulesPatchSchema.safeParse({ home: { floorBounce: "0.5" } }).success).toBe(true);
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
