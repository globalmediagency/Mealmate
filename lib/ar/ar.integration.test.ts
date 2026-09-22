import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { respondToBoarding, startBoarding } from "@/lib/boarding/service";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { creatures, profiles } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { gameDate } from "@/lib/game/time";
import { saveManualSteps } from "@/lib/steps/service";
import type { ObjectStorage } from "@/lib/storage/r2";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { AR_MARKER, isMarkerId } from "./config";
import { photoMarkerImage, savePhotoMarker, setPhotoMarkerEnabled } from "./photo-marker";
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

const stored = new Map<string, Uint8Array>();
const storage: ObjectStorage = {
  async put(key, bytes) {
    stored.set(key, bytes);
  },
  async get(key) {
    const bytes = stored.get(key);
    return bytes ? { bytes, contentType: "image/jpeg" } : null;
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

  it("hands a friend's photo marker to the viewer's phone (and the owner's to the host of a boarded creature), only while it is in use", async () => {
    // Nobody uses a photo yet.
    expect((await listArTargets(alice, T0)).targets.map((t) => t.image)).toEqual([null, null]);
    // Bob photographs his marker: Alice's phone must look for that picture under Roux's number.
    const bobPhoto = await savePhotoMarker(bob, { bytes: Uint8Array.of(1, 2), mimeType: "image/jpeg" }, storage, T0, "bob-photo");
    let forAlice = await listArTargets(alice, T0);
    expect(forAlice.targets.find((t) => t.creature.name === "Roux")).toMatchObject({ markerId: 0, ownerName: "BobAR", image: bobPhoto.imageUrl });
    expect(forAlice.own?.image).toBeNull();
    expect((await photoMarkerImage(alice, bob, storage))?.bytes).toEqual(Uint8Array.of(1, 2));
    // Alice photographs hers: Bob, who boards Miso, gets it for Miso; he still sees his own on Roux.
    const alicePhoto = await savePhotoMarker(alice, { bytes: Uint8Array.of(3), mimeType: "image/jpeg" }, storage, T0, "alice-photo");
    const forBob = await listArTargets(bob, T0);
    expect(forBob.targets.find((t) => t.creature.name === "Miso")).toMatchObject({ mine: false, ownerName: "AliceAR", image: alicePhoto.imageUrl });
    expect(forBob.own).toMatchObject({ creature: { name: "Roux" }, image: bobPhoto.imageUrl });
    // Carol is nobody's friend: neither the target nor the picture reach her.
    const forCarol = await listArTargets(carol, T0);
    expect(forCarol.targets.map((t) => t.creature.name)).toEqual(["Nuage"]);
    await expect(photoMarkerImage(carol, alice, storage)).rejects.toMatchObject({ code: "not_found" });
    // Bob switches his photo off: Alice's phone stops looking for it, the printed marker remains.
    await setPhotoMarkerEnabled(bob, false);
    forAlice = await listArTargets(alice, T0);
    expect(forAlice.targets.find((t) => t.creature.name === "Roux")).toMatchObject({ markerId: 0, image: null });
    expect(await photoMarkerImage(alice, bob, storage)).toBeNull();
  });

  it("stays inside the dictionary", () => {
    expect(AR_MARKER.ids).toBe(587);
  });
});
