import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import {
  acceptFriendRequest,
  countIncomingRequests,
  findProfileByCodeOrUsername,
  listFriends,
  listRequests,
  removeFriendship,
  sendFriendRequest,
} from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob@example.com", "Bob");
  carol = await insertTestUser(tdb.db, "carol@example.com", "Carol");
  await getDb().insert(profiles).values([
    { userId: alice, username: "Alice_01", friendCode: "MM-AAAAAA" },
    { userId: bob, username: "BobLeBricoleur", friendCode: "MM-BBBBBB" },
    { userId: carol, username: "Carolane", friendCode: "MM-CCCCCC" },
  ]);
  // Bob has a living creature, Carol an egg.
  await createEgg(bob, "facile");
  await saveManualSteps(bob, 15_000, await getActiveCreature(bob));
  await hatchEgg(bob);
  await nameCreature(bob, "Pixel");
  await createEgg(carol, "moyen");
});

afterAll(async () => {
  await tdb.close();
});

describe("lookup", () => {
  it("finds by code (any format) or by pseudo (any case)", async () => {
    expect((await findProfileByCodeOrUsername("mm-bbbbbb"))?.userId).toBe(bob);
    expect((await findProfileByCodeOrUsername(" BBBBBB "))?.userId).toBe(bob);
    expect((await findProfileByCodeOrUsername("boblebricoleur"))?.userId).toBe(bob);
    expect(await findProfileByCodeOrUsername("Bobby")).toBeNull();
  });
});

describe("requests", () => {
  it("creates a pending request and lists it on both sides", async () => {
    const outcome = await sendFriendRequest(alice, "MM-BBBBBB");
    expect(outcome).toEqual({ status: "requested", friend: { userId: bob, username: "BobLeBricoleur" } });
    const forBob = await listRequests(bob);
    expect(forBob.incoming.map((r) => r.user.username)).toEqual(["Alice_01"]);
    expect((await listRequests(alice)).outgoing.map((r) => r.user.username)).toEqual(["BobLeBricoleur"]);
    expect(await countIncomingRequests(bob)).toBe(1);
  });

  it("refuses self, duplicates and unknown players", async () => {
    await expect(sendFriendRequest(alice, "MM-AAAAAA")).rejects.toMatchObject({ code: "self" });
    await expect(sendFriendRequest(alice, "BobLeBricoleur")).rejects.toMatchObject({ code: "already_requested" });
    await expect(sendFriendRequest(alice, "MM-ZZZZZZ")).rejects.toMatchObject({ code: "not_found" });
  });

  it("only the addressee can accept, then both are friends", async () => {
    const [request] = (await listRequests(bob)).incoming;
    await expect(acceptFriendRequest(alice, request.id)).rejects.toMatchObject({ code: "not_found" });
    await acceptFriendRequest(bob, request.id);
    await expect(sendFriendRequest(alice, "BobLeBricoleur")).rejects.toMatchObject({ code: "already_friends" });
    expect((await listFriends(alice)).map((f) => f.user.username)).toEqual(["BobLeBricoleur"]);
    expect((await listFriends(bob)).map((f) => f.user.username)).toEqual(["Alice_01"]);
  });

  it("accepts a reciprocal request automatically", async () => {
    await sendFriendRequest(carol, "Alice_01");
    const outcome = await sendFriendRequest(alice, "Carolane");
    expect(outcome.status).toBe("accepted");
    expect((await listRequests(alice)).incoming).toHaveLength(0);
  });
});

describe("friend cards", () => {
  it("exposes only what a friend may see, sorted alive → egg → none", async () => {
    const friends = await listFriends(alice);
    expect(friends.map((f) => f.user.username)).toEqual(["BobLeBricoleur", "Carolane"]);
    const [bobCard, carolCard] = friends;
    expect(bobCard.creature.status).toBe("alive");
    if (bobCard.creature.status === "alive") {
      expect(bobCard.creature.name).toBe("Pixel");
      expect(bobCard.creature.species?.tier).toBe("facile");
      expect(bobCard.creature.health).toBe(100);
      expect(bobCard.creature.state).toBe("healthy");
      expect("hunger" in bobCard.creature).toBe(false);
    }
    expect(carolCard.creature).toMatchObject({ status: "egg", tier: "moyen", hatchProgress: 0 });
    // Alice herself has no creature: seen from Bob she is "none".
    expect((await listFriends(bob))[0].creature.status).toBe("none");
  });

  it("removes a friendship from either side", async () => {
    const [carolCard] = (await listFriends(alice)).filter((f) => f.user.userId === carol);
    await expect(removeFriendship(bob, carolCard.friendshipId)).rejects.toMatchObject({ code: "not_found" });
    await removeFriendship(carol, carolCard.friendshipId);
    expect((await listFriends(alice)).map((f) => f.user.username)).toEqual(["BobLeBricoleur"]);
  });
});
