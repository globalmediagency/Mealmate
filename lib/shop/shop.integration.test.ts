import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { creatures, gifts, profiles, purchases } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import type { CheckoutProvider, CheckoutSessionInfo } from "./provider";
import {
  confirmCheckout,
  createCheckout,
  creditPurchase,
  getInventory,
  healFriendCreature,
  listPurchases,
  listUnseenGifts,
  markGiftsSeen,
  consumeMedicine,
} from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;
let friendshipAliceBob: string;

/** In-memory checkout provider: sessions are "paid" when the test says so. */
function fakeProvider() {
  const sessions = new Map<string, CheckoutSessionInfo>();
  let counter = 0;
  const provider: CheckoutProvider = {
    async createSession(input) {
      const id = `cs_test_${++counter}`;
      sessions.set(id, { id, paid: false, expired: false, userId: input.userId, item: input.item, amountCents: input.amountCents });
      return { id, url: `https://checkout.example/${id}` };
    },
    async retrieveSession(id) {
      return sessions.get(id) ?? null;
    },
  };
  return {
    provider,
    pay: (id: string) => sessions.set(id, { ...sessions.get(id)!, paid: true }),
    expire: (id: string) => sessions.set(id, { ...sessions.get(id)!, expired: true }),
  };
}

async function hatchFor(userId: string, name: string) {
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId));
  await hatchEgg(userId);
  await nameCreature(userId, name);
  return (await getActiveCreature(userId))!;
}

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice-shop@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob-shop@example.com", "Bob");
  carol = await insertTestUser(tdb.db, "carol-shop@example.com", "Carol");
  await getDb().insert(profiles).values([
    { userId: alice, username: "AliceShop", friendCode: "MM-SHOP01" },
    { userId: bob, username: "BobShop", friendCode: "MM-SHOP02" },
    { userId: carol, username: "CarolShop", friendCode: "MM-SHOP03" },
  ]);
  await hatchFor(alice, "Pixel");
  await hatchFor(bob, "Bulle");
  await sendFriendRequest(alice, "BobShop");
  const [request] = (await listRequests(bob)).incoming;
  await acceptFriendRequest(bob, request.id);
  friendshipAliceBob = request.id;
});

afterAll(async () => {
  await tdb.close();
});

describe("checkout and credit", () => {
  const fake = fakeProvider();

  it("creates a pending purchase and credits it exactly once", async () => {
    const { url, sessionId } = await createCheckout(alice, "sirop", "https://mealmate.test", fake.provider);
    expect(url).toContain(sessionId);
    const [row] = await getDb().select().from(purchases).where(eq(purchases.stripeSessionId, sessionId));
    expect(row).toMatchObject({ userId: alice, item: "sirop", amountCents: 199, status: "pending" });

    // Webhook path.
    fake.pay(sessionId);
    expect(await creditPurchase({ sessionId })).toMatchObject({ credited: true, item: "sirop" });
    expect((await getInventory(alice)).sirop).toBe(1);
    // Replayed webhook / success page: no double credit.
    expect(await creditPurchase({ sessionId })).toMatchObject({ credited: false });
    expect(await confirmCheckout(alice, sessionId, fake.provider)).toEqual({ status: "paid", item: "sirop", credited: false });
    expect((await getInventory(alice)).sirop).toBe(1);
  });

  it("confirms from the success page when the webhook never ran", async () => {
    const { sessionId } = await createCheckout(alice, "antibiotique", "https://mealmate.test", fake.provider);
    expect(await confirmCheckout(alice, sessionId, fake.provider)).toMatchObject({ status: "pending", credited: false });
    fake.pay(sessionId);
    expect(await confirmCheckout(alice, sessionId, fake.provider)).toEqual({ status: "paid", item: "antibiotique", credited: true });
    expect((await getInventory(alice)).antibiotique).toBe(1);
    await expect(confirmCheckout(bob, sessionId, fake.provider)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("marks abandoned sessions as cancelled and records unknown paid sessions from provider data", async () => {
    const { sessionId } = await createCheckout(alice, "talisman", "https://mealmate.test", fake.provider);
    fake.expire(sessionId);
    expect(await confirmCheckout(alice, sessionId, fake.provider)).toMatchObject({ status: "cancelled" });
    expect((await getInventory(alice)).talisman).toBe(0);

    expect(await creditPurchase({ sessionId: "cs_test_lost", userId: alice, item: "talisman", amountCents: 599 })).toMatchObject({ credited: true });
    expect(await creditPurchase({ sessionId: "cs_test_lost", userId: alice, item: "talisman", amountCents: 599 })).toMatchObject({ credited: false });
    expect(await creditPurchase({ sessionId: "cs_test_unknown" })).toMatchObject({ credited: false });
    expect((await getInventory(alice)).talisman).toBe(1);
    expect((await listPurchases(alice)).map((p) => p.status).sort()).toEqual(["cancelled", "paid", "paid", "paid"]);
  });
});

describe("using medicine", () => {
  it("heals the own creature and consumes a dose", async () => {
    const db = getDb();
    const creature = (await getActiveCreature(alice))!;
    await db.update(creatures).set({ health: 20, sickSince: new Date() }).where(eq(creatures.id, creature.id));
    const sick = (await getActiveCreature(alice))!;
    const outcome = await consumeMedicine(alice, sick, "sirop");
    expect(outcome.creature.health).toBe(50);
    expect(outcome.cured).toBe(true);
    expect(outcome.creature.sickSince).toBeNull();
    expect(outcome.inventory.sirop).toBe(0);
    await expect(consumeMedicine(alice, outcome.creature, "sirop")).rejects.toMatchObject({ code: "no_stock" });
  });

  it("refuses to waste a dose on a creature in full health", async () => {
    const db = getDb();
    const creature = (await getActiveCreature(alice))!;
    await db.update(creatures).set({ health: 100 }).where(eq(creatures.id, creature.id));
    await expect(consumeMedicine(alice, (await getActiveCreature(alice))!, "antibiotique")).rejects.toMatchObject({ code: "not_needed" });
    expect((await getInventory(alice)).antibiotique).toBe(1);
    const talisman = await consumeMedicine(alice, (await getActiveCreature(alice))!, "talisman");
    expect(talisman.protectedUntil).not.toBeNull();
    expect(talisman.inventory.talisman).toBe(0);
  });
});

describe("gifts to friends", () => {
  it("only reaches accepted friends whose creature is tired or sick", async () => {
    await expect(healFriendCreature(alice, "00000000-0000-0000-0000-000000000000", "antibiotique")).rejects.toMatchObject({ code: "not_found" });
    await expect(healFriendCreature(alice, friendshipAliceBob, "antibiotique")).rejects.toMatchObject({ code: "not_needed" });
    expect((await getInventory(alice)).antibiotique).toBe(1);
  });

  it("sends a dose, heals the friend's creature and records the gift", async () => {
    const db = getDb();
    const bobCreature = (await getActiveCreature(bob))!;
    await db.update(creatures).set({ health: 12, sickSince: new Date() }).where(eq(creatures.id, bobCreature.id));
    const outcome = await healFriendCreature(alice, friendshipAliceBob, "antibiotique");
    expect(outcome.friend.username).toBe("BobShop");
    expect(outcome.creatureName).toBe("Bulle");
    expect(outcome.creature.health).toBe(100);
    expect(outcome.inventory.antibiotique).toBe(0);
    expect((await getActiveCreature(bob))!.health).toBe(100);

    const unseen = await listUnseenGifts(bob);
    expect(unseen).toHaveLength(1);
    expect(unseen[0]).toMatchObject({ from: { username: "AliceShop" }, item: "antibiotique" });
    expect(await listUnseenGifts(alice)).toEqual([]);
    await markGiftsSeen(bob);
    expect(await listUnseenGifts(bob)).toEqual([]);
    expect(await db.select().from(gifts).where(eq(gifts.toUserId, bob))).toHaveLength(1);
  });

  it("cannot send what the shelf does not hold", async () => {
    const db = getDb();
    const bobCreature = (await getActiveCreature(bob))!;
    await db.update(creatures).set({ health: 40 }).where(eq(creatures.id, bobCreature.id));
    await expect(healFriendCreature(alice, friendshipAliceBob, "sirop")).rejects.toMatchObject({ code: "no_stock" });
  });
});
