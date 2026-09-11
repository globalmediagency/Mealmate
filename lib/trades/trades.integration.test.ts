import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { equipAccessory, getOutfit, getOwnedAccessories } from "@/lib/accessories/service";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { gifts, profiles, userAccessories } from "@/lib/db/schema";

// Lets a test interleave a concurrent change right before one of the swap's conditional decrements.
const hooks = vi.hoisted(() => ({ beforeTake: null as null | ((userId: string, accessoryId: string) => Promise<void>) }));
vi.mock("@/lib/accessories/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/accessories/service")>();
  return {
    ...actual,
    takeAccessoryCopy: async (userId: string, accessoryId: string) => {
      await hooks.beforeTake?.(userId, accessoryId);
      return actual.takeAccessoryCopy(userId, accessoryId);
    },
  };
});
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { countUnseenGifts, listUnseenGifts } from "@/lib/shop/service";
import { acceptTrade, countIncomingTrades, giftAccessory, listTrades, proposeTrade, tradeableAccessories, withdrawTrade } from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let friendship: string;

const owned = async (userId: string) => (await getOwnedAccessories(userId)).map((o) => o.accessory.id).sort();

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice-trade@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob-trade@example.com", "Bob");
  const db = getDb();
  await db.insert(profiles).values([
    { userId: alice, username: "AliceTrade", friendCode: "MM-TRADE1" },
    { userId: bob, username: "BobTrade", friendCode: "MM-TRADE2" },
  ]);
  await createEgg(alice, "facile");
  await saveManualSteps(alice, 15_000, await getActiveCreature(alice));
  await hatchEgg(alice);
  await nameCreature(alice, "Pixel");
  await sendFriendRequest(alice, "BobTrade");
  const [request] = (await listRequests(bob)).incoming;
  await acceptFriendRequest(bob, request.id);
  friendship = request.id;
  await db.insert(userAccessories).values([
    { userId: alice, accessoryId: "straw_hat" },
    { userId: alice, accessoryId: "beret" },
    { userId: bob, accessoryId: "straw_hat" },
    { userId: bob, accessoryId: "crown" },
  ]);
});

afterAll(async () => {
  await tdb.close();
});

describe("trades", () => {
  it("lists both wardrobes with their copies", async () => {
    const view = await tradeableAccessories(alice, friendship);
    expect(view.friend.username).toBe("BobTrade");
    expect(view.theirs.map((o) => [o.accessory.id, o.qty])).toEqual([["straw_hat", 1], ["crown", 1]]);
    expect(view.mine.map((o) => [o.accessory.id, o.qty])).toEqual([["beret", 1], ["straw_hat", 1]]);
  });

  it("validates a proposal (copies of an item one already owns are allowed)", async () => {
    await expect(proposeTrade(alice, friendship, "beret", "beret")).rejects.toMatchObject({ code: "same_accessory" });
    await expect(proposeTrade(alice, friendship, "crown", "beret")).rejects.toMatchObject({ code: "not_owned" });
    await expect(proposeTrade(alice, friendship, "beret", "wizard_hat")).rejects.toMatchObject({ code: "not_owned" });
    await expect(proposeTrade(alice, friendship, "beret", "nope")).rejects.toMatchObject({ code: "unknown_accessory" });
    const second = await proposeTrade(alice, friendship, "beret", "straw_hat");
    expect(second.status).toBe("pending");
    await withdrawTrade(alice, second.id);
  });

  it("proposes, lists on both sides and swaps on acceptance (unequipping first)", async () => {
    const creature = (await getActiveCreature(alice))!;
    await equipAccessory(alice, creature, "head", "beret");
    const trade = await proposeTrade(alice, friendship, "beret", "crown");
    expect(trade.status).toBe("pending");
    await expect(proposeTrade(alice, friendship, "beret", "crown")).rejects.toMatchObject({ code: "already_proposed" });

    expect((await listTrades(alice)).outgoing.map((t) => [t.other.username, t.offered.id, t.requested.id])).toEqual([["BobTrade", "beret", "crown"]]);
    expect((await listTrades(bob)).incoming).toHaveLength(1);
    expect(await countIncomingTrades(bob)).toBe(1);
    expect(await countIncomingTrades(alice)).toBe(0);

    await expect(acceptTrade(alice, trade.id)).rejects.toMatchObject({ code: "not_found" });
    const accepted = await acceptTrade(bob, trade.id);
    expect(accepted.status).toBe("accepted");
    expect(await owned(alice)).toEqual(["crown", "straw_hat"]);
    expect(await owned(bob)).toEqual(["beret", "straw_hat"]);
    expect(await getOutfit(creature.id)).toEqual({}); // the last copy of the beret left Alice's wardrobe
    await expect(acceptTrade(bob, trade.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listTrades(alice)).recent.some((t) => t.id === trade.id && t.status === "accepted")).toBe(true);
  });

  it("lets the receiver decline and the proposer withdraw", async () => {
    const declined = await proposeTrade(alice, friendship, "crown", "beret");
    expect((await withdrawTrade(bob, declined.id)).status).toBe("declined");
    const cancelled = await proposeTrade(alice, friendship, "crown", "beret");
    expect((await withdrawTrade(alice, cancelled.id)).status).toBe("cancelled");
    await expect(withdrawTrade(alice, cancelled.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listTrades(alice)).outgoing).toEqual([]);
    expect(await owned(alice)).toEqual(["crown", "straw_hat"]);
  });

  it("cancels a proposal that became impossible", async () => {
    const trade = await proposeTrade(bob, friendship, "beret", "crown");
    await getDb().delete(userAccessories).where(and(eq(userAccessories.userId, bob), eq(userAccessories.accessoryId, "beret")));
    await expect(acceptTrade(alice, trade.id)).rejects.toMatchObject({ code: "no_longer_valid" });
    expect((await listTrades(alice)).incoming).toEqual([]);
    expect((await listTrades(bob)).recent.some((t) => t.id === trade.id && t.status === "cancelled")).toBe(true);
  });
  it("gives a copy away without acceptance and notifies the friend", async () => {
    // Alice owns straw_hat once, Bob owns straw_hat once: after the gift Bob has two copies.
    const creature = (await getActiveCreature(alice))!;
    await equipAccessory(alice, creature, "head", "straw_hat");
    const outcome = await giftAccessory(alice, friendship, "straw_hat");
    expect(outcome).toMatchObject({ friend: { username: "BobTrade" }, accessory: { id: "straw_hat" }, copiesLeft: 0 });
    expect(await owned(alice)).toEqual(["crown"]);
    expect((await getOwnedAccessories(bob)).find((o) => o.accessory.id === "straw_hat")?.qty).toBe(2);
    expect(await getOutfit(creature.id)).toEqual({});
    const unseen = await listUnseenGifts(bob);
    expect(unseen).toHaveLength(1);
    expect(unseen[0]).toMatchObject({ kind: "accessory", from: { username: "AliceTrade" }, accessory: { id: "straw_hat" } });
    expect(await countUnseenGifts(bob)).toBe(1);
    await expect(giftAccessory(alice, friendship, "straw_hat")).rejects.toMatchObject({ code: "not_owned" });
    await expect(giftAccessory(alice, friendship, "nope")).rejects.toMatchObject({ code: "unknown_accessory" });
  });

  it("only counts the gifts the notice can show", async () => {
    await getDb().insert(gifts).values({ fromUserId: alice, toUserId: bob, item: "vanished_accessory", kind: "accessory" });
    expect(await listUnseenGifts(bob)).toHaveLength(1);
    expect(await countUnseenGifts(bob)).toBe(1);
  });

  it("refunds the receiver and cancels the trade when the proposer's copy vanishes mid-swap", async () => {
    // Alice owns crown ×1, Bob owns straw_hat ×2. Bob proposes straw_hat for the crown.
    const trade = await proposeTrade(bob, friendship, "straw_hat", "crown");
    hooks.beforeTake = async (userId, accessoryId) => {
      // Alice's crown is already taken at this point; Bob gives his hats away "at the same time".
      if (userId === bob && accessoryId === "straw_hat") {
        await getDb().delete(userAccessories).where(and(eq(userAccessories.userId, bob), eq(userAccessories.accessoryId, "straw_hat")));
      }
    };
    try {
      await expect(acceptTrade(alice, trade.id)).rejects.toMatchObject({ code: "no_longer_valid" });
    } finally {
      hooks.beforeTake = null;
    }
    expect(await owned(alice)).toEqual(["crown"]);
    expect((await owned(bob)).includes("straw_hat")).toBe(false);
    expect((await owned(alice)).includes("straw_hat")).toBe(false);
    expect((await listTrades(bob)).recent.some((t) => t.id === trade.id && t.status === "cancelled")).toBe(true);
    expect((await listTrades(alice)).incoming).toEqual([]);
  });
});
