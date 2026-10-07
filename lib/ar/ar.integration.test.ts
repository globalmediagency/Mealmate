import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { respondToBoarding, startBoarding } from "@/lib/boarding/service";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { creatures, profiles } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { gameDate } from "@/lib/game/time";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { AR_MARKER, isMarkerId } from "./config";
import { ensureCreatureMarker, listArTargets, ownCreatureById } from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;
let misoId: string;
let rouxId: string;
let friendship: string;

const T0 = new Date();
const D0 = gameDate(T0);

async function bringUp(userId: string, name: string) {
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId), D0);
  await hatchEgg(userId, T0);
  return nameCreature(userId, name);
}

async function befriend(from: string, toUsername: string, to: string) {
  await sendFriendRequest(from, toUsername);
  const [request] = (await listRequests(to)).incoming;
  await acceptFriendRequest(to, request.id);
  return request.id;
}

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice-ar@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob-ar@example.com", "Bob");
  carol = await insertTestUser(tdb.db, "carol-ar@example.com", "Carol");
  await getDb().insert(profiles).values([
    { userId: alice, username: "AliceAR", friendCode: "MM-AR0001" },
    { userId: bob, username: "BobAR", friendCode: "MM-AR0002" },
    { userId: carol, username: "CarolAR", friendCode: "MM-AR0003" },
  ]);
  misoId = (await bringUp(alice, "Miso")).id;
  rouxId = (await bringUp(bob, "Roux")).id;
  await bringUp(carol, "Nuage");
  friendship = await befriend(alice, "BobAR", bob);
});

afterAll(async () => {
  await tdb.close();
});

describe("ensureCreatureMarker", () => {
  it("assigns a number once, avoiding the friends' numbers, and keeps it afterwards", async () => {
    // Bob's creature takes number 0 by hand: Alice must not get it whatever the dice say.
    await getDb().update(creatures).set({ arMarker: 0 }).where(eq(creatures.id, rouxId));
    const miso = (await ownCreatureById(alice, misoId))!;
    expect(miso.arMarker).toBeNull();
    const first = await ensureCreatureMarker(miso, () => 0);
    expect(first).toBe(1);
    expect(isMarkerId(first)).toBe(true);
    // A second call, even with other dice, returns the stored number.
    const again = await ensureCreatureMarker((await ownCreatureById(alice, misoId))!, () => 0.5);
    expect(again).toBe(1);
    // The stale row (marker still null in memory) does not overwrite it either.
    expect(await ensureCreatureMarker(miso, () => 0.9)).toBe(1);
  });

  it("only hands out the viewer's own creatures", async () => {
    expect(await ownCreatureById(alice, rouxId)).toBeNull();
    expect(await ownCreatureById(bob, rouxId)).not.toBeNull();
  });
});

describe("listArTargets", () => {
  it("lists the own creature (marker assigned) and the friends' creatures that have one, not strangers", async () => {
    const result = await listArTargets(alice, T0);
    expect(result.own?.creature.name).toBe("Miso");
    expect(result.own?.mine).toBe(true);
    expect(result.own?.creatureId).toBe(misoId);
    expect(result.targets.map((t) => [t.creature.name, t.markerId, t.ownerName])).toEqual([
      ["Miso", 1, null],
      ["Roux", 0, "BobAR"],
    ]);
    expect(result.conflicts).toEqual([]);
    // Carol is nobody's friend: her creature never shows up.
    expect(result.targets.some((t) => t.creature.name === "Nuage")).toBe(false);
  });

  it("ignores a friend's creature without a marker yet", async () => {
    await getDb().update(creatures).set({ arMarker: null }).where(eq(creatures.id, rouxId));
    const result = await listArTargets(alice, T0);
    expect(result.targets.map((t) => t.creature.name)).toEqual(["Miso"]);
    await getDb().update(creatures).set({ arMarker: 0 }).where(eq(creatures.id, rouxId));
  });

  it("keeps one creature per number: own first, then the others", async () => {
    // Bob's creature is forced onto Miso's number.
    await getDb().update(creatures).set({ arMarker: 1 }).where(eq(creatures.id, rouxId));
    const result = await listArTargets(alice, T0);
    expect(result.targets.map((t) => t.creature.name)).toEqual(["Miso"]);
    expect(result.conflicts).toEqual(["Roux"]);
    await getDb().update(creatures).set({ arMarker: 0 }).where(eq(creatures.id, rouxId));
  });

  it("shows a boarded creature to its host with the owner's name, and keeps it for the owner while away", async () => {
    const proposal = await startBoarding(alice, friendship, 7, T0);
    await respondToBoarding(bob, proposal.boarding.id, true, T0);
    const forBob = await listArTargets(bob, T0);
    const miso = forBob.targets.find((t) => t.creature.name === "Miso");
    expect(miso).toMatchObject({ markerId: 1, mine: false, ownerName: "AliceAR" });
    expect(forBob.targets.filter((t) => t.creature.name === "Miso")).toHaveLength(1);
    const forAlice = await listArTargets(alice, T0);
    expect(forAlice.own?.creature.name).toBe("Miso");
    expect(forAlice.targets.map((t) => t.creature.name)).toEqual(["Miso", "Roux"]);
  });

  it("stays inside the dictionary", () => {
    expect(AR_MARKER.ids).toBe(587);
  });
});
