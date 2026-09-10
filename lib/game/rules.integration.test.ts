import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/lib/test/pglite";
import { DEFAULT_RULES } from "./rules";
import { getGameRules, getStoredRules, invalidateRulesCache, resetGameRules, saveGameRules } from "./rules-service";

let tdb: TestDatabase;

beforeAll(async () => {
  tdb = await createTestDatabase();
  invalidateRulesCache();
});

afterAll(async () => {
  invalidateRulesCache();
  await tdb.close();
});

describe("rules service", () => {
  it("returns the defaults when nothing is stored", async () => {
    expect(await getGameRules()).toEqual(DEFAULT_RULES);
    expect(await getStoredRules()).toEqual({ patch: {}, updatedAt: null, updatedBy: null });
  });

  it("saves overrides and serves them", async () => {
    const rules = await saveGameRules({ tiers: { facile: { hungerPerHour: 3, sickDaysBeforeDeath: 10 } } }, "admin");
    expect(rules.tiers.facile.hungerPerHour).toBe(3);
    expect(rules.tiers.facile.sickDaysBeforeDeath).toBe(10);
    expect(rules.tiers.moyen).toEqual(DEFAULT_RULES.tiers.moyen);
    const stored = await getStoredRules();
    expect(stored.patch.tiers?.facile?.hungerPerHour).toBe(3);
    expect(stored.updatedBy).toBe("admin");
    invalidateRulesCache();
    expect((await getGameRules()).tiers.facile.hungerPerHour).toBe(3);
  });

  it("rejects out-of-range values", async () => {
    await expect(saveGameRules({ tiers: { facile: { hatchSteps: 1 } } }, "admin")).rejects.toThrow();
  });

  it("resets to defaults", async () => {
    await resetGameRules("admin");
    invalidateRulesCache();
    expect(await getGameRules()).toEqual(DEFAULT_RULES);
  });
});
