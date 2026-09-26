import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { gameSettings } from "@/lib/db/schema";
import { speciesForTier } from "@/lib/creatures";
import { createTestDatabase, type TestDatabase } from "@/lib/test/pglite";
import { drawSpecies } from "./rarity";
import { discoverableSpecies, getDisabledSpecies, getStoredDisabledSpecies, invalidateDisabledSpeciesCache, setSpeciesEnabled } from "./species-service";

let tdb: TestDatabase;

beforeAll(async () => {
  tdb = await createTestDatabase();
  invalidateDisabledSpeciesCache();
});

afterAll(async () => {
  await tdb.close();
});

describe("disabled species", () => {
  it("starts with every species enabled, switches one off and on, and stores who did it", async () => {
    expect(await getDisabledSpecies()).toEqual(new Set());
    const [first, second] = speciesForTier("facile");
    expect(await setSpeciesEnabled(first.id, false, "chef")).toEqual([first.id]);
    expect(await setSpeciesEnabled(second.id, false, "chef")).toEqual([first.id, second.id].sort());
    expect(await getDisabledSpecies()).toEqual(new Set([first.id, second.id]));
    expect((await getStoredDisabledSpecies()).updatedBy).toBe("chef");
    for (let i = 0; i < 50; i += 1) expect([first.id, second.id]).not.toContain(drawSpecies("facile", undefined, {}, await getDisabledSpecies()).id);
    expect(await setSpeciesEnabled(first.id, true, "chef")).toEqual([second.id]);
    expect(await setSpeciesEnabled(second.id, true, "chef")).toEqual([]);
  });

  it("refuses an unknown species and the last species of a tier", async () => {
    await expect(setSpeciesEnabled("facile-inconnu", false, "chef")).rejects.toMatchObject({ code: "not_found", status: 404 });
    const pool = speciesForTier("difficile");
    for (const species of pool.slice(1)) await setSpeciesEnabled(species.id, false, "chef");
    await expect(setSpeciesEnabled(pool[0].id, false, "chef")).rejects.toMatchObject({ code: "last_species", status: 400 });
    expect((await getDisabledSpecies()).has(pool[0].id)).toBe(false);
    for (const species of pool.slice(1)) await setSpeciesEnabled(species.id, true, "chef");
  });

  it("forgets unknown ids of a hand-edited document and hides disabled species a player does not own", async () => {
    await getDb()
      .insert(gameSettings)
      .values({ id: "species", data: { disabled: ["facile-chat-rond", "facile-fantome", 42] } })
      .onConflictDoUpdate({ target: gameSettings.id, set: { data: { disabled: ["facile-chat-rond", "facile-fantome", 42] } } });
    invalidateDisabledSpeciesCache();
    expect((await getStoredDisabledSpecies()).disabled).toEqual(["facile-chat-rond"]);
    const disabled = await getDisabledSpecies();
    const pool = speciesForTier("facile");
    expect(discoverableSpecies(pool, disabled, new Set()).map((s) => s.id)).not.toContain("facile-chat-rond");
    expect(discoverableSpecies(pool, disabled, new Set(["facile-chat-rond"])).map((s) => s.id)).toContain("facile-chat-rond");
    await getDb().delete(gameSettings).where(eq(gameSettings.id, "species"));
    invalidateDisabledSpeciesCache();
  });
});
