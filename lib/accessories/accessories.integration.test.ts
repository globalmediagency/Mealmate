import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { countPlaysToday, recordPlay } from "@/lib/play/service";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { accessoriesByRarity } from "./catalog";
import { equipAccessory, getChestStatus, getOutfit, getOwnedAccessories, openChest } from "./service";

let tdb: TestDatabase;
let userId: string;

beforeAll(async () => {
  tdb = await createTestDatabase();
  userId = await insertTestUser(tdb.db, "chest@example.com");
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId));
  await hatchEgg(userId);
  await nameCreature(userId, "Noisette");
});

afterAll(async () => {
  await tdb.close();
});

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("chests", () => {
  it("earns one chest per 5 000 steps since the hatch day", async () => {
    const creature = (await getActiveCreature(userId))!;
    const status = await getChestStatus(creature);
    expect(status.totalSteps).toBe(15_000);
    expect(status.earned).toBe(3);
    expect(status.available).toBe(3);
  });

  it("opens a chest, grants the accessory, then turns duplicates into xp", async () => {
    const groups = accessoriesByRarity();
    let creature = (await getActiveCreature(userId))!;
    const first = await openChest(userId, creature, sequence([0, 0]));
    expect(first.accessory.id).toBe(groups.commun[0].id);
    expect(first.duplicate).toBe(false);
    expect(first.status.available).toBe(2);
    expect((await getOwnedAccessories(userId)).map((o) => o.accessory.id)).toEqual([groups.commun[0].id]);

    creature = (await getActiveCreature(userId))!;
    const xpBefore = creature.xp;
    const second = await openChest(userId, creature, sequence([0, 0]));
    expect(second.duplicate).toBe(true);
    expect(second.xpGain).toBe(20);
    expect((await getActiveCreature(userId))!.xp).toBe(xpBefore + 20);
  });

  it("refuses to open the same chest twice concurrently", async () => {
    const creature = (await getActiveCreature(userId))!;
    await openChest(userId, creature, sequence([0.7, 0]));
    await expect(openChest(userId, creature, sequence([0.7, 0]))).rejects.toMatchObject({ code: "no_chest" });
    const fresh = (await getActiveCreature(userId))!;
    await expect(openChest(userId, fresh)).rejects.toMatchObject({ code: "no_chest" });
  });
});

describe("wardrobe", () => {
  it("equips owned accessories only, on the right slot, and removes them", async () => {
    const creature = (await getActiveCreature(userId))!;
    const groups = accessoriesByRarity();
    const owned = groups.commun[0];
    const outfit = await equipAccessory(userId, creature, owned.slot, owned.id);
    expect(outfit[owned.slot]).toBe(owned.id);
    await expect(equipAccessory(userId, creature, "body", owned.id)).rejects.toMatchObject({ code: "wrong_slot" });
    await expect(equipAccessory(userId, creature, "head", "halo")).rejects.toMatchObject({ code: "not_owned" });
    const cleared = await equipAccessory(userId, creature, owned.slot, null);
    expect(cleared[owned.slot]).toBeUndefined();
    expect(await getOutfit(creature.id)).toEqual({});
  });
});

describe("mini-game", () => {
  it("applies +15 mood / +5 xp (+5 perfect) and caps at 3 plays per day", async () => {
    let creature = (await getActiveCreature(userId))!;
    const before = creature.mood;
    const first = await recordPlay(userId, creature, 60);
    expect(first.effects).toEqual({ moodDelta: 15, xpDelta: 5, perfect: false });
    expect(first.creature.mood).toBe(Math.min(100, before + 15));
    expect(first.playsLeft).toBe(2);
    creature = first.creature;
    const second = await recordPlay(userId, creature, 100);
    expect(second.effects.xpDelta).toBe(10);
    creature = second.creature;
    await recordPlay(userId, creature, 999);
    expect(await countPlaysToday(userId)).toBe(3);
    await expect(recordPlay(userId, creature, 50)).rejects.toMatchObject({ code: "play_limit", status: 429 });
  });
});
