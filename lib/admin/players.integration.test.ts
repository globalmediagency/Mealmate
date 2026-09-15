import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { gameDate } from "@/lib/game/time";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { listPlayers, matchesPlayer } from "./players";

let tdb: TestDatabase;
let alice: string;
let bob: string;
const T0 = new Date();

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice-admin@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob-admin@example.com", "Bob");
  await getDb().insert(profiles).values([
    { userId: alice, username: "AliceAdm", friendCode: "MM-ADM001" },
    { userId: bob, username: "BobAdm", friendCode: "MM-ADM002" },
  ]);
  await createEgg(alice, "facile");
  await saveManualSteps(alice, 15_000, await getActiveCreature(alice), gameDate(T0));
  await hatchEgg(alice, T0);
  await nameCreature(alice, "Miso");
  await createEgg(bob, "moyen");
  await saveManualSteps(bob, 2_500, await getActiveCreature(bob), gameDate(T0));
  await sendFriendRequest(alice, "BobAdm");
  const [request] = (await listRequests(bob)).incoming;
  await acceptFriendRequest(bob, request.id);
});

afterAll(async () => {
  await tdb.close();
});

describe("listPlayers", () => {
  it("lists every profile with its creature, counters and email", async () => {
    const players = await listPlayers(T0);
    expect(players.map((p) => p.username).sort()).toEqual(["AliceAdm", "BobAdm"]);
    const a = players.find((p) => p.username === "AliceAdm")!;
    expect(a.email).toBe("alice-admin@example.com");
    expect(a.friendCode).toBe("MM-ADM001");
    expect(a.counts).toEqual({ meals: 0, steps: 15_000, friends: 1, deadCreatures: 0 });
    expect(a.creature).toMatchObject({ status: "alive", name: "Miso", tier: "facile", tierLabel: "Facile", state: "healthy", stageLabel: "Bébé", accessories: [], arMarker: null });
    expect(a.creature?.speciesName).toBeTruthy();
    expect(a.creatureIsCurrent).toBe(true);
    const b = players.find((p) => p.username === "BobAdm")!;
    expect(b.creature).toMatchObject({ status: "egg", eggSteps: 2_500, tier: "moyen" });
    expect(b.counts.friends).toBe(1);
    expect(b.awayAt).toBeNull();
    expect(b.hosting).toBe(0);
  });

  it("ticks the living creature in memory without writing it", async () => {
    const later = new Date(T0.getTime() + 10 * 3_600_000);
    const players = await listPlayers(later);
    const a = players.find((p) => p.username === "AliceAdm")!;
    expect(a.creature?.hunger).toBeCloseTo(20, 0);
    const stored = await getActiveCreature(alice);
    expect(stored?.hunger).toBe(0);
  });

  it("matches on username, email, friend code and creature name, ignoring accents and case", async () => {
    const players = await listPlayers(T0);
    const a = players.find((p) => p.username === "AliceAdm")!;
    expect(matchesPlayer(a, "alice")).toBe(true);
    expect(matchesPlayer(a, "ALICE-ADMIN@")).toBe(true);
    expect(matchesPlayer(a, "adm001")).toBe(true);
    expect(matchesPlayer(a, "mísó")).toBe(true);
    expect(matchesPlayer(a, "bob")).toBe(false);
    expect(matchesPlayer(a, "  ")).toBe(true);
  });
});
