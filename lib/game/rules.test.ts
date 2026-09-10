import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, gameRulesPatchSchema, mergeRules, rulesFromDocument, simulateNeglect } from "./rules";

describe("rules", () => {
  it("defaults mirror the config constants", () => {
    expect(DEFAULT_RULES.tiers.facile.hatchSteps).toBe(15_000);
    expect(DEFAULT_RULES.tiers.difficile.sickDaysBeforeDeath).toBe(3);
    expect(DEFAULT_RULES.hungerDamageThreshold).toBe(80);
    expect(DEFAULT_RULES.feeding.maxMealsPerDay).toBe(5);
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
