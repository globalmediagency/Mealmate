import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MealAnalysis } from "@/lib/ai/meal-schema";
import { DomainError } from "@/lib/api/errors";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { creatures } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ObjectStorage } from "@/lib/storage/r2";
import { getGameRules } from "@/lib/game/rules-service";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { countMealsToday, feedCreature, listMeals, mealStats } from "./service";

let tdb: TestDatabase;
let userId: string;

const stored = new Map<string, Uint8Array>();
const storage: ObjectStorage = {
  async put(key, bytes) {
    stored.set(key, bytes);
  },
  async signedUrl(key) {
    return `https://signed.example/${key}`;
  },
  async remove(key) {
    stored.delete(key);
  },
  async removePrefix(prefix) {
    let n = 0;
    for (const key of [...stored.keys()]) if (key.startsWith(prefix)) { stored.delete(key); n += 1; }
    return n;
  },
};

function analysis(overrides: Partial<MealAnalysis> = {}): MealAnalysis {
  return {
    is_food: true,
    score: 82,
    verdict: "sain",
    foods: ["saumon", "quinoa"],
    macros: { proteins: 4, fibers: 4, carbs: 3, fats: 3, sugars: 1, ultra_processed: 1 },
    portion: "raisonnable",
    comment: "Bravo !",
    creature_line: "Miam !",
    photo_source: "real",
    ...overrides,
  };
}

const image = (seed: string) => ({ bytes: new TextEncoder().encode(`fake-image-${seed}`), mimeType: "image/jpeg" });

beforeAll(async () => {
  tdb = await createTestDatabase();
  userId = await insertTestUser(tdb.db, "meals@example.com");
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId));
  await hatchEgg(userId);
  await nameCreature(userId, "Miso");
});

afterAll(async () => {
  await tdb.close();
});

describe("feedCreature", () => {
  it("stores the photo, saves the meal and applies effects", async () => {
    // Make the creature hungry first so the health effect is not halved.
    const before = (await getActiveCreature(userId))!;
    await getDb().update(creatures).set({ hunger: 70, health: 80 }).where(eq(creatures.id, before.id));

    const result = await feedCreature({ userId, image: image("a"), analyzer: async () => analysis(), storage });
    expect(result.meal.score).toBe(82);
    expect(result.meal.imageKey).toMatch(new RegExp(`^meals/${userId}/`));
    expect(stored.has(result.meal.imageKey)).toBe(true);
    expect(result.imageUrl).toContain("https://signed.example/");
    expect(result.effects.healthDelta).toBe(10.5);
    expect(result.creature.health).toBeCloseTo(90.5, 2);
    expect(result.creature.hunger).toBeCloseTo(30, 2);
    expect(result.creature.mood).toBe(100);
    expect(result.creature.xp).toBe(15); // steps walked as an egg give no XP; +15 for a healthy meal
    expect(result.mealsToday).toBe(1);
  });

  it("refuses the same photo within 24 h and non-food photos without storing", async () => {
    await expect(
      feedCreature({ userId, image: image("a"), analyzer: async () => analysis(), storage }),
    ).rejects.toMatchObject({ code: "duplicate_meal" });
    const sizeBefore = stored.size;
    await expect(
      feedCreature({ userId, image: image("b"), analyzer: async () => analysis({ is_food: false, score: 0 }), storage }),
    ).rejects.toMatchObject({ code: "not_food" });
    expect(stored.size).toBe(sizeBefore);
  });

  it("halves the health effect when full and applies negative scores", async () => {
    // hunger is 30 (< 15 is "full") — make it full explicitly.
    const c = (await getActiveCreature(userId))!;
    await getDb().update(creatures).set({ hunger: 5, health: 50 }).where(eq(creatures.id, c.id));
    const result = await feedCreature({ userId, image: image("c"), analyzer: async () => analysis({ score: 10, verdict: "peu_sain" }), storage });
    expect(result.effects.full).toBe(true);
    expect(result.effects.healthDelta).toBeCloseTo(-3.75, 1); // (10−40)/4 = −7.5 → /2
    expect(result.creature.health).toBeCloseTo(46.3, 1);
  });

  it("enforces the daily limit of 5 meals", async () => {
    for (const seed of ["d", "e", "f"]) {
      await feedCreature({ userId, image: image(seed), analyzer: async () => analysis(), storage });
    }
    expect(await countMealsToday(userId)).toBe(5);
    await expect(
      feedCreature({ userId, image: image("g"), analyzer: async () => analysis(), storage }),
    ).rejects.toMatchObject({ code: "meal_limit", status: 429 });
  });

  it("lists meals with signed urls and computes stats", async () => {
    const list = await listMeals(userId, storage);
    expect(list).toHaveLength(5);
    expect(list[0].imageUrl).toContain("signed.example");
    const stats = await mealStats(userId);
    expect(stats.todayCount).toBe(5);
    expect(stats.weekCount).toBe(5);
    expect(stats.weekAverage).toBe(Math.round((82 * 4 + 10) / 5));
    expect(stats.daily).toHaveLength(30);
  });

  it("propagates analyzer errors without storing anything", async () => {
    const other = await insertTestUser(tdb.db, "other@example.com");
    await createEgg(other, "facile");
    await saveManualSteps(other, 15_000, await getActiveCreature(other));
    await hatchEgg(other);
    const sizeBefore = stored.size;
    await expect(
      feedCreature({
        userId: other,
        image: image("h"),
        analyzer: async () => {
          throw new DomainError("ai_unavailable", "Indisponible.", 503);
        },
        storage,
      }),
    ).rejects.toMatchObject({ code: "ai_unavailable", status: 503 });
    expect(stored.size).toBe(sizeBefore);
    expect(await countMealsToday(other)).toBe(0);
  });
  it("flags screen photos, and refuses them when the admin rule is on", async () => {
    // A different day so today's meal limit and duplicate window are untouched.
    const now = new Date(Date.now() - 60 * 86_400_000);
    const rules = await getGameRules();
    const flagged = await feedCreature({ userId, image: image("screen-1"), analyzer: async () => analysis({ photo_source: "screen" }), storage, now, rules });
    expect(flagged.meal.photoSource).toBe("screen");
    expect(flagged.meal.score).toBe(82);

    const strict = { ...rules, feeding: { ...rules.feeding, rejectScreenPhotos: true } };
    const sizeBefore = stored.size;
    await expect(
      feedCreature({ userId, image: image("screen-2"), analyzer: async () => analysis({ photo_source: "printed" }), storage, now, rules: strict }),
    ).rejects.toMatchObject({ code: "screen_photo", status: 422 });
    expect(stored.size).toBe(sizeBefore);
    const real = await feedCreature({ userId, image: image("screen-3"), analyzer: async () => analysis({ photo_source: "real" }), storage, now, rules: strict });
    expect(real.meal.photoSource).toBe("real");
  });
});
