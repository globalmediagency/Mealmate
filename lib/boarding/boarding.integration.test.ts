import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MealAnalysis } from "@/lib/ai/meal-schema";
import { getChestStatus, getOwnedAccessories, openChest } from "@/lib/accessories/service";
import { countUserFootprint } from "@/lib/account/service";
import { createEgg, getActiveCreature, getUnmournedDeath, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { boardings, creatures, meals, profiles } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { BOARDING } from "@/lib/game/config";
import { gameDate, shiftDate } from "@/lib/game/time";
import { feedCreature } from "@/lib/meals/service";
import { recordPlay } from "@/lib/play/service";
import { consumeMedicine, creditPurchase, getInventory } from "@/lib/shop/service";
import { saveManualSteps } from "@/lib/steps/service";
import type { ObjectStorage } from "@/lib/storage/r2";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { creatureStepsSince } from "./custody-service";
import { countUnseenBoardings, endBoarding, getHeldCreature, getHeldCreatures, livingHeld, markBoardingsSeen, saveStepsForHeld, startBoarding } from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;
let friendship: string;
let misoId: string;

const DAY = 86_400_000;
const T0 = new Date();
const T1 = new Date(T0.getTime() + DAY); // the stay starts tomorrow (the hatch day stays the owner's)
const D0 = gameDate(T0);
const D1 = shiftDate(D0, 1);

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
  async removePrefix() {
    return 0;
  },
};
const analyzer = async (): Promise<MealAnalysis> => ({
  is_food: true,
  score: 85,
  verdict: "sain",
  foods: ["lentilles"],
  macros: { proteins: 4, fibers: 4, carbs: 3, fats: 2, sugars: 1, ultra_processed: 1 },
  portion: "raisonnable",
  comment: "Bravo !",
  creature_line: "Miam !",
  photo_source: "real",
});
let photo = 0;
const image = () => ({ bytes: new TextEncoder().encode(`photo-${photo++}`), mimeType: "image/jpeg" });

async function bringUp(userId: string, name: string) {
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId), D0);
  await hatchEgg(userId, T0);
  return nameCreature(userId, name);
}

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice-board@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob-board@example.com", "Bob");
  carol = await insertTestUser(tdb.db, "carol-board@example.com", "Carol");
  await getDb().insert(profiles).values([
    { userId: alice, username: "AliceB", friendCode: "MM-BOARD1" },
    { userId: bob, username: "BobB", friendCode: "MM-BOARD2" },
    { userId: carol, username: "CarolB", friendCode: "MM-BOARD3" },
  ]);
  misoId = (await bringUp(alice, "Miso")).id;
  await bringUp(bob, "Roux");
  await sendFriendRequest(alice, "BobB");
  const [request] = (await listRequests(bob)).incoming;
  await acceptFriendRequest(bob, request.id);
  friendship = request.id;
});

afterAll(async () => {
  await tdb.close();
});

describe("starting a stay", () => {
  it("validates the duration, the friendship and the creature", async () => {
    await expect(startBoarding(alice, friendship, 0, T1)).rejects.toMatchObject({ code: "validation_error" });
    await expect(startBoarding(alice, friendship, BOARDING.maxDays + 1, T1)).rejects.toMatchObject({ code: "validation_error" });
    await expect(startBoarding(carol, friendship, 7, T1)).rejects.toMatchObject({ code: "not_found" });
    await expect(startBoarding(alice, "00000000-0000-4000-8000-000000000000", 7, T1)).rejects.toMatchObject({ code: "not_found" });
  });

  it("sends the creature to the friend's home, who is notified", async () => {
    const outcome = await startBoarding(alice, friendship, 7, T1);
    expect(outcome.friend.username).toBe("BobB");
    expect(outcome.creature.name).toBe("Miso");
    expect(outcome.boarding.endsAt.getTime()).toBe(T1.getTime() + 7 * DAY);
    await expect(startBoarding(alice, friendship, 3, T1)).rejects.toMatchObject({ code: "already_boarded" });

    const mine = await getHeldCreatures(alice, T1);
    expect(mine.own?.id).toBe(misoId);
    expect(mine.away?.host.username).toBe("BobB");
    expect(livingHeld(mine)).toEqual([]);

    const theirs = await getHeldCreatures(bob, T1);
    expect(theirs.own?.name).toBe("Roux");
    expect(theirs.away).toBeNull();
    expect(theirs.boarded.map((h) => [h.creature.name, h.owner.username])).toEqual([["Miso", "AliceB"]]);
    expect(livingHeld(theirs).map((h) => h.creature.name)).toEqual(["Roux", "Miso"]);

    expect(await countUnseenBoardings(bob, T1)).toBe(1);
    await markBoardingsSeen(bob, T1);
    expect(await countUnseenBoardings(bob, T1)).toBe(0);
    expect((await countUserFootprint(alice)).boardings).toBe(1);
  });

  it("keeps the owner away from their creature and strangers out", async () => {
    await expect(getHeldCreature(alice, undefined, T1)).rejects.toMatchObject({ code: "creature_boarded" });
    await expect(getHeldCreature(alice, misoId, T1)).rejects.toMatchObject({ code: "creature_boarded" });
    await expect(getHeldCreature(carol, misoId, T1)).rejects.toMatchObject({ code: "not_found" });
    await expect(getHeldCreature(carol, undefined, T1)).rejects.toMatchObject({ code: "no_creature" });
    await expect(feedCreature({ userId: alice, image: image(), analyzer, storage, now: T1 })).rejects.toMatchObject({ code: "creature_boarded" });
    const held = await getHeldCreature(bob, misoId, T1);
    expect(held.boarding).not.toBeNull();
    expect(held.owner?.username).toBe("AliceB");
  });
});

describe("the host takes care of the creature", () => {
  it("feeds every creature in their care with one meal", async () => {
    await getDb().update(creatures).set({ hunger: 80 }).where(eq(creatures.userId, bob));
    await getDb().update(creatures).set({ hunger: 70 }).where(eq(creatures.id, misoId));
    const result = await feedCreature({ userId: bob, image: image(), analyzer, storage, now: T1 });
    expect(result.creature.name).toBe("Roux");
    expect(result.creature.hunger).toBeLessThan(80);
    expect(result.others.map((o) => [o.creature.name, o.ownerName])).toEqual([["Miso", "AliceB"]]);
    expect(result.others[0].creature.hunger).toBeLessThan(70);
    expect(result.others[0].effects.xpDelta).toBeGreaterThan(0);
    const [row] = await getDb().select().from(meals).where(eq(meals.id, result.meal.id));
    expect(row.userId).toBe(bob);
  });

  it("credits their steps to every creature in their care", async () => {
    const before = (await getDb().select().from(creatures).where(eq(creatures.id, misoId)))[0];
    const result = await saveStepsForHeld(bob, 6_000, "set", D1, T1);
    expect(result.credited).toBe(2);
    expect(result.gains).toEqual({ healthGain: 6, xpGain: 12 });
    expect(result.own?.name).toBe("Roux");
    const after = (await getDb().select().from(creatures).where(eq(creatures.id, misoId)))[0];
    expect(after.xp).toBe(before.xp + 12);
  });

  it("earns Miso's chests with the host's steps, not the owner's", async () => {
    // Alice walked 15 000 the hatch day (hers), Bob 6 000 on the boarding day (his): 21 000 in all.
    await saveManualSteps(alice, 4_000, null, D1); // the owner's steps while the creature is away: ignored
    expect(await creatureStepsSince({ id: misoId, userId: alice }, D0)).toBe(21_000);
    const miso = (await getHeldCreature(bob, misoId, T1)).creature;
    expect((await getChestStatus(miso)).earned).toBe(4);
    await expect(openChest(bob, miso, () => 0)).rejects.toMatchObject({ code: "forbidden" });
    const reward = await openChest(bob, miso, () => 0, { boarded: true });
    expect((await getOwnedAccessories(bob)).some((o) => o.accessory.id === reward.accessory.id)).toBe(true);
    expect((await getOwnedAccessories(alice)).some((o) => o.accessory.id === reward.accessory.id)).toBe(false);
  });

  it("plays with it and heals it from their own medicine cabinet", async () => {
    const miso = (await getHeldCreature(bob, misoId, T1)).creature;
    await expect(recordPlay(bob, miso, 80, T1)).rejects.toMatchObject({ code: "forbidden" });
    const played = await recordPlay(bob, miso, 80, T1, { boarded: true });
    expect(played.creature.xp).toBe(miso.xp + 5);

    await getDb().update(creatures).set({ health: 40, sickSince: null }).where(eq(creatures.id, misoId));
    await creditPurchase({ sessionId: "cs_board_1", userId: bob, item: "sirop", amountCents: 299 });
    const sick = (await getHeldCreature(bob, misoId, T1)).creature;
    const healed = await consumeMedicine(bob, sick, "sirop", T1, { boarded: true });
    expect(healed.creature.health).toBeGreaterThan(40);
    expect((await getInventory(bob)).sirop).toBe(0);
  });

  it("can send the creature home early; the owner can then entrust it again and take it back", async () => {
    const [open] = await getDb().select().from(boardings).where(eq(boardings.creatureId, misoId));
    const returned = await endBoarding(bob, open.id, T1);
    expect(returned.role).toBe("host");
    expect(returned.boarding.endReason).toBe("returned");
    expect(returned.other.username).toBe("AliceB");
    expect((await getHeldCreatures(alice, T1)).away).toBeNull();
    expect((await getHeldCreatures(bob, T1)).boarded).toEqual([]);

    const again = await startBoarding(alice, friendship, 5, T1);
    await expect(endBoarding(carol, again.boarding.id, T1)).rejects.toMatchObject({ code: "not_found" });
    const recovered = await endBoarding(alice, again.boarding.id, new Date(T1.getTime() + 3_600_000));
    expect(recovered.role).toBe("owner");
    expect(recovered.boarding.endReason).toBe("recovered");
    expect(recovered.creature.status).toBe("alive");
    // Ending twice is harmless.
    expect((await endBoarding(alice, again.boarding.id, T1)).boarding.endReason).toBe("recovered");
  });
});

describe("the stay ends on its own", () => {
  it("expires after the agreed duration", async () => {
    const stay = await startBoarding(alice, friendship, 1, T1);
    const later = new Date(T1.getTime() + 2 * DAY);
    expect((await getHeldCreatures(bob, later)).boarded).toEqual([]);
    expect((await getHeldCreatures(alice, later)).away).toBeNull();
    const [row] = await getDb().select().from(boardings).where(eq(boardings.id, stay.boarding.id));
    expect(row.endReason).toBe("expired");
    expect(row.endedAt?.getTime()).toBe(stay.boarding.endsAt.getTime());
  });

  it("sends a creature that died at the host's back to its owner, dead", async () => {
    const T2 = new Date(T1.getTime() + 2 * DAY);
    const stay = await startBoarding(alice, friendship, 30, T2);
    // Sick for a month with no care: the next tick is fatal.
    await getDb().update(creatures).set({ health: 1, sickSince: new Date(T2.getTime() - 30 * DAY), lastTickAt: T2, protectedUntil: null }).where(eq(creatures.id, misoId));
    const T3 = new Date(T2.getTime() + DAY);
    expect((await getHeldCreatures(bob, T3)).boarded).toEqual([]);
    const ended = await endBoarding(alice, stay.boarding.id, T3);
    expect(ended.boarding.endReason).toBe("died");
    expect(ended.creature.status).toBe("dead");
    expect((await getUnmournedDeath(alice))?.id).toBe(misoId);
    expect((await getHeldCreatures(alice, T3)).own).toBeNull();
  });
});
