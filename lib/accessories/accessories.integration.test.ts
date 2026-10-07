import { applyMoodToXp } from "@/lib/game/mood";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { countPlaysToday, recordPlay } from "@/lib/play/service";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { CHEST_BACKDROPS, backdropsByRarity } from "@/lib/backdrops/catalog";
import { addBackdrop, countBackdropStats, getOwnedBackdrops, setCreatureBackdrop } from "@/lib/backdrops/service";
import { accessoriesByRarity } from "./catalog";
import { addAccessoryCopies, equipAccessory, getChestStatus, getOutfit, getOwnedAccessories, openChest, takeAccessoryCopy, type AccessoryReward, type BackdropReward, type ChestReward } from "./service";

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

/** A chest whose first roll (≥ the backdrop chance) skips the backdrop, then draws the accessory with the next rolls. */
const NO_BACKDROP = 0.99;

function accessoryOf(reward: ChestReward): AccessoryReward {
  if (reward.kind !== "accessory") throw new Error(`Expected an accessory, got ${reward.kind}.`);
  return reward;
}

function backdropOf(reward: ChestReward): BackdropReward {
  if (reward.kind !== "backdrop") throw new Error(`Expected a backdrop, got ${reward.kind}.`);
  return reward;
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
    const first = accessoryOf(await openChest(userId, creature, sequence([NO_BACKDROP, 0, 0])));
    expect(first.accessory.id).toBe(groups.commun[0].id);
    expect(first.duplicate).toBe(false);
    expect(first.equipped).toBe(false);
    expect(first.status.available).toBe(2);
    expect((await getOwnedAccessories(userId)).map((o) => o.accessory.id)).toEqual([groups.commun[0].id]);

    creature = (await getActiveCreature(userId))!;
    await equipAccessory(userId, creature, groups.commun[0].slot, groups.commun[0].id);
    const xpBefore = creature.xp;
    const second = accessoryOf(await openChest(userId, creature, sequence([NO_BACKDROP, 0, 0])));
    expect(second.duplicate).toBe(true);
    expect(second.copies).toBe(2);
    expect(second.equipped).toBe(true); // already worn: the reveal shows "Déjà porté" instead of "Équiper"
    expect((await getActiveCreature(userId))!.xp).toBe(xpBefore);
    const owned = await getOwnedAccessories(userId);
    expect(owned.find((o) => o.accessory.id === groups.commun[0].id)?.qty).toBe(2);
  });

  it("takes copies one by one and unequips the accessory when the last copy leaves", async () => {
    const groups = accessoriesByRarity();
    const id = groups.commun[0].id;
    const creature = (await getActiveCreature(userId))!;
    await equipAccessory(userId, creature, groups.commun[0].slot, id);
    expect(await takeAccessoryCopy(userId, id)).toBe(1);
    expect((await getOutfit(creature.id))[groups.commun[0].slot]).toBe(id);
    expect(await takeAccessoryCopy(userId, id)).toBe(0);
    expect((await getOutfit(creature.id))[groups.commun[0].slot]).toBeUndefined();
    expect((await getOwnedAccessories(userId)).some((o) => o.accessory.id === id)).toBe(false);
    await expect(takeAccessoryCopy(userId, id)).rejects.toMatchObject({ code: "not_owned" });
    expect(await addAccessoryCopies(userId, id)).toBe(1);
  });

  it("hands out a backdrop the opener is missing, never twice, then accessories only once the set is complete", async () => {
    // Give one more chest: 5 000 steps the day after hatching.
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    await saveManualSteps(userId, 5_000, await getActiveCreature(userId), tomorrow);
    let creature = (await getActiveCreature(userId))!;
    expect((await getChestStatus(creature)).available).toBe(2);
    // A low first roll = a backdrop; the second roll (0) lands on the first common scene.
    const found = backdropOf(await openChest(userId, creature, sequence([0, 0])));
    expect(found.backdrop.id).toBe(backdropsByRarity().commun[0].id);
    expect(found.equipped).toBe(false);
    expect(found.status.available).toBe(1);
    expect((await getOwnedBackdrops(userId)).map((o) => o.backdrop.id)).toEqual([found.backdrop.id]);
    // The wardrobe: a found scene or a design scene can be picked, an unknown or missing one cannot.
    creature = (await getActiveCreature(userId))!;
    expect(await setCreatureBackdrop(userId, creature, found.backdrop.id)).toBe(found.backdrop.id);
    expect((await getActiveCreature(userId))!.backdrop).toBe(found.backdrop.id);
    expect(await setCreatureBackdrop(userId, creature, "velours")).toBe("velours");
    // The admin tab counts who found what and what the living creatures show.
    const stats = await countBackdropStats();
    expect(stats.found[found.backdrop.id]).toBe(1);
    expect(stats.inUse.velours).toBe(1);
    expect(stats.followingDesign).toBe(0);
    await expect(setCreatureBackdrop(userId, creature, "galaxie")).rejects.toMatchObject({ code: "not_owned" });
    await expect(setCreatureBackdrop(userId, creature, "nope")).rejects.toMatchObject({ code: "unknown_backdrop" });
    expect(await setCreatureBackdrop(userId, creature, null)).toBeNull();
    // Once every chest scene is found, the low roll gives an accessory again.
    for (const b of CHEST_BACKDROPS) await addBackdrop(userId, b.id);
    expect(await addBackdrop(userId, CHEST_BACKDROPS[0].id)).toBe(false);
    expect((await getOwnedBackdrops(userId)).length).toBe(CHEST_BACKDROPS.length);
    creature = (await getActiveCreature(userId))!;
    expect((await openChest(userId, creature, sequence([0, 0]))).kind).toBe("accessory");
  });

  it("refuses to open the same chest twice concurrently", async () => {
    const creature = (await getActiveCreature(userId))!;
    await expect(openChest(userId, creature, sequence([NO_BACKDROP, 0.7, 0]))).rejects.toMatchObject({ code: "no_chest" });
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
    // The XP follows the mood before the game (spec § 3.18).
    expect(first.effects).toEqual({ moodDelta: 15, xpDelta: applyMoodToXp(5, before), perfect: false, xpMultiplier: before >= 70 ? 1.25 : before < 30 ? 0.75 : 1 });
    expect(first.creature.mood).toBe(Math.min(100, before + 15));
    expect(first.playsLeft).toBe(2);
    creature = first.creature;
    const second = await recordPlay(userId, creature, 100);
    expect(second.effects.xpDelta).toBe(applyMoodToXp(10, creature.mood));
    creature = second.creature;
    await recordPlay(userId, creature, 999);
    expect(await countPlaysToday(creature.id)).toBe(3);
    await expect(recordPlay(userId, creature, 50)).rejects.toMatchObject({ code: "play_limit", status: 429 });
  });
});
