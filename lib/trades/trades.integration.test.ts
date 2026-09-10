import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { equipAccessory, getOutfit, getOwnedAccessories } from "@/lib/accessories/service";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { profiles, userAccessories } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { acceptTrade, countIncomingTrades, listTrades, proposeTrade, tradeableAccessories, withdrawTrade } from "./service";

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
  it("lists only what each side lacks", async () => {
    const view = await tradeableAccessories(alice, friendship);
    expect(view.friend.username).toBe("BobTrade");
    expect(view.theirs.map((a) => a.id)).toEqual(["crown"]);
    expect(view.mine.map((a) => a.id)).toEqual(["beret"]);
  });

  it("validates a proposal", async () => {
    await expect(proposeTrade(alice, friendship, "beret", "beret")).rejects.toMatchObject({ code: "same_accessory" });
    await expect(proposeTrade(alice, friendship, "crown", "beret")).rejects.toMatchObject({ code: "not_owned" });
    await expect(proposeTrade(alice, friendship, "beret", "wizard_hat")).rejects.toMatchObject({ code: "not_owned" });
    await expect(proposeTrade(alice, friendship, "straw_hat", "crown")).rejects.toMatchObject({ code: "already_owned" });
    await expect(proposeTrade(alice, friendship, "beret", "straw_hat")).rejects.toMatchObject({ code: "already_owned" });
    await expect(proposeTrade(alice, friendship, "beret", "nope")).rejects.toMatchObject({ code: "unknown_accessory" });
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
    expect(await getOutfit(creature.id)).toEqual({});
    await expect(acceptTrade(bob, trade.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listTrades(alice)).recent.map((t) => t.status)).toEqual(["accepted"]);
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
});
