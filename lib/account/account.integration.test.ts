import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MealAnalysis } from "@/lib/ai/meal-schema";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { creatures, inventory, profiles, purchases, userAccessories } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { feedCreature } from "@/lib/meals/service";
import { healFriendCreature } from "@/lib/shop/service";
import { saveManualSteps } from "@/lib/steps/service";
import type { ObjectStorage } from "@/lib/storage/r2";
import type { StravaApi } from "@/lib/strava/api";
import { connectStrava } from "@/lib/strava/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { proposeTrade } from "@/lib/trades/service";
import { countUserFootprint, deleteAccount, exportAccount, hasPasswordAccount, purgeExternalData } from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;

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

const stravaCalls = { deauthorized: 0 };
const stravaApi: StravaApi = {
  authorizeUrl: () => "https://strava.test",
  async exchangeCode() {
    return { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3_600_000), athlete: { id: 1, name: "Alice" } };
  },
  async refresh() {
    return { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3_600_000), athlete: null };
  },
  async listActivities() {
    return [];
  },
  async deauthorize() {
    stravaCalls.deauthorized += 1;
  },
};

const analysis: MealAnalysis = {
  is_food: true,
  score: 80,
  verdict: "sain",
  foods: ["soupe"],
  macros: { proteins: 3, fibers: 4, carbs: 3, fats: 2, sugars: 1, ultra_processed: 1 },
  portion: "raisonnable",
  comment: "Bien.",
  creature_line: "Miam.",
  photo_source: "real",
};

async function hatchFor(userId: string, name: string) {
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId));
  await hatchEgg(userId);
  await nameCreature(userId, name);
  return (await getActiveCreature(userId))!;
}

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice-account@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob-account@example.com", "Bob");
  const db = getDb();
  await db.insert(profiles).values([
    { userId: alice, username: "AliceAcc", friendCode: "MM-ACC001" },
    { userId: bob, username: "BobAcc", friendCode: "MM-ACC002" },
  ]);
  await hatchFor(alice, "Pixel");
  const bobCreature = await hatchFor(bob, "Bulle");
  // A meal with a photo in storage.
  await feedCreature({ userId: alice, image: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, analyzer: async () => analysis, storage });
  // Friendship, gift and trade with Bob.
  await sendFriendRequest(alice, "BobAcc");
  const [request] = (await listRequests(bob)).incoming;
  await acceptFriendRequest(bob, request.id);
  await db.insert(userAccessories).values([{ userId: alice, accessoryId: "beret" }, { userId: bob, accessoryId: "crown" }]);
  await proposeTrade(alice, request.id, "beret", "crown");
  await db.insert(inventory).values({ userId: alice, item: "sirop", qty: 2 });
  await db.update(creatures).set({ health: 20, sickSince: new Date() }).where(eq(creatures.id, bobCreature.id));
  await healFriendCreature(alice, request.id, "sirop");
  await db.insert(purchases).values({ userId: alice, stripeSessionId: "cs_acc_1", item: "sirop", amountCents: 199, status: "paid" });
  await connectStrava(alice, "code", stravaApi);
});

afterAll(async () => {
  await tdb.close();
});

describe("export", () => {
  it("returns every section without image keys and names other people by username only", async () => {
    const data = await exportAccount(alice);
    expect(data.user?.email).toBe("alice-account@example.com");
    expect(data.profile?.friendCode).toBe("MM-ACC001");
    expect(data.creatures).toHaveLength(1);
    expect(data.meals).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("meals/");
    expect(JSON.stringify(data)).not.toContain(bob);
    expect(data.friends).toEqual([{ username: "BobAcc", status: "accepted", direction: "sent", since: expect.any(Date) }]);
    expect(data.gifts[0]).toMatchObject({ direction: "sent", with: "BobAcc", item: "sirop" });
    expect(data.trades[0]).toMatchObject({ direction: "proposed", with: "BobAcc", offered: "beret", requested: "crown" });
    expect(data.purchases[0]).toMatchObject({ item: "sirop", status: "paid" });
    expect(data.strava).toEqual({ connected: true, athleteName: "Alice", lastSyncAt: null });
    expect(await hasPasswordAccount(alice)).toBe(false);
  });
});

describe("deletion", () => {
  it("purges photos and Strava, then the row cascades everywhere; the friend keeps their own data", async () => {
    expect([...stored.keys()].some((k) => k.startsWith(`meals/${alice}/`))).toBe(true);
    const before = await countUserFootprint(alice);
    expect(before).toMatchObject({ profiles: 1, creatures: 1, meals: 1, friendships: 1, gifts: 1, trades: 1, inventory: 1, purchases: 1 });

    const report = await deleteAccount(alice, { storage, stravaApi });
    expect(report).toEqual({ photosRemoved: 1, stravaRevoked: true, deleted: true });
    expect(stravaCalls.deauthorized).toBe(1);
    expect([...stored.keys()].some((k) => k.startsWith(`meals/${alice}/`))).toBe(false);

    const after = await countUserFootprint(alice);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    const bobAfter = await countUserFootprint(bob);
    expect(bobAfter).toMatchObject({ profiles: 1, creatures: 1, friendships: 0, gifts: 0, trades: 0, accessories: 1 });
    expect(await exportAccount(alice)).toMatchObject({ user: null, profile: null, creatures: [] });
  });

  it("is a no-op on a missing user and tolerates an unconfigured storage", async () => {
    const report = await deleteAccount("nobody", { storage, stravaApi });
    expect(report).toEqual({ photosRemoved: 0, stravaRevoked: false, deleted: false });
    const { ConfigError } = await import("@/lib/env");
    const broken: ObjectStorage = { ...storage, removePrefix: async () => { throw new ConfigError(["R2_BUCKET"]); } };
    expect(await purgeExternalData(bob, { storage: broken, stravaApi })).toEqual({ photosRemoved: 0, stravaRevoked: false });
  });
});
