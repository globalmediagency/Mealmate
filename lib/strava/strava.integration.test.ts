import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { stepEntries, stravaConnections } from "@/lib/db/schema";
import { gameDate, shiftDate } from "@/lib/game/time";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import type { StravaActivity, StravaApi, StravaTokens } from "./api";
import { connectStrava, disconnectStrava, getStravaStatus, syncStrava } from "./service";

let tdb: TestDatabase;
let userId: string;

// Real clock: the egg row is stamped with the database `now()`, and steps only count from that day.
const T0 = new Date();
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const today = gameDate(T0);

function fakeApi(activities: StravaActivity[]) {
  const counters = { exchanged: 0, refreshed: 0, deauthorized: 0, listed: 0 };
  const tokens = (suffix: string): StravaTokens => ({
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresAt: new Date(T0.getTime() + 6 * 3_600_000),
    athlete: { id: 4242, name: "Camille" },
  });
  const api: StravaApi = {
    authorizeUrl: ({ state }) => `https://strava.test/authorize?state=${state}`,
    async exchangeCode() {
      counters.exchanged += 1;
      return tokens("initial");
    },
    async refresh() {
      counters.refreshed += 1;
      return { ...tokens("refreshed"), athlete: null };
    },
    async listActivities(_token, { after, page, perPage }) {
      counters.listed += 1;
      const rows = activities.filter((a) => new Date(a.startDateLocal) > after);
      return rows.slice((page - 1) * perPage, page * perPage);
    },
    async deauthorize() {
      counters.deauthorized += 1;
    },
  };
  return { api, counters, activities };
}

const run = (id: number, km: number, dateLocal = `${today}T08:00:00Z`): StravaActivity => ({
  id,
  name: `Sortie ${id}`,
  sportType: "Run",
  distanceMetres: km * 1000,
  movingTimeSeconds: km * 360,
  startDateLocal: dateLocal,
});

beforeAll(async () => {
  tdb = await createTestDatabase();
  userId = await insertTestUser(tdb.db, "strava@example.com", "Camille");
  await createEgg(userId, "facile");
});

afterAll(async () => {
  await tdb.close();
});

describe("connection", () => {
  it("stores the tokens server-side and exposes a safe status", async () => {
    const { api, counters } = fakeApi([]);
    expect((await getStravaStatus(userId)).connected).toBe(false);
    const status = await connectStrava(userId, "code-123", api, T0);
    expect(counters.exchanged).toBe(1);
    expect(status).toEqual({ connected: true, athleteId: 4242, athleteName: "Camille", lastSyncAt: null, nextSyncAt: null });
    expect(JSON.stringify(status)).not.toContain("access-");
    const [row] = await getDb().select().from(stravaConnections).where(eq(stravaConnections.userId, userId));
    expect(row.accessToken).toBe("access-initial");
  });
});

describe("sync", () => {
  it("imports activities as strava step entries and feeds the egg", async () => {
    const { api } = fakeApi([
      run(1, 5),
      { ...run(2, 10), sportType: "Ride" },
      { ...run(3, 0), movingTimeSeconds: 0 },
      run(99, 8, `${shiftDate(today, -45)}T08:00:00Z`), // outside the 30-day window
    ]);
    const egg = (await getActiveCreature(userId))!;
    const result = await syncStrava(userId, api, egg, T0);
    expect(result.imported.map((a) => [a.id, a.sport, a.steps])).toEqual([
      [1, "Course", 6500],
      [2, "Vélo", 4000],
    ]);
    expect(result.skipped).toBe(1);
    expect(result.gains).toEqual({ healthGain: 0, xpGain: 0 });
    expect(result.creature?.eggSteps).toBe(10_500);
    expect(result.status.lastSyncAt).toBe(T0.toISOString());
    expect(result.status.nextSyncAt).toBe(minutes(5).toISOString());
  });

  it("throttles to one sync every five minutes", async () => {
    const { api } = fakeApi([]);
    await expect(syncStrava(userId, api, null, minutes(2))).rejects.toMatchObject({ code: "too_soon", status: 429 });
  });

  it("skips duplicates and credits a living creature per day across sources", async () => {
    // Hatch with a manual entry, then import one more walk on the same day.
    await saveManualSteps(userId, 15_000, await getActiveCreature(userId), today);
    await hatchEgg(userId, minutes(6));
    await nameCreature(userId, "Pixel");
    const creature = (await getActiveCreature(userId))!;
    const before = { health: creature.health, xp: creature.xp };

    const { api, counters } = fakeApi([run(1, 5), { ...run(2, 10), sportType: "Ride" }, { ...run(4, 3), sportType: "Walk" }]);
    const result = await syncStrava(userId, api, creature, minutes(10));
    expect(counters.refreshed).toBe(0);
    expect(result.imported.map((a) => a.id)).toEqual([4]);
    expect(result.skipped).toBe(2);
    // Day total 15 000 + 6 500 + 4 000 + 3 900 = 29 400, nothing credited before: +10 health (cap), +58 XP.
    expect(result.gains).toEqual({ healthGain: 10, xpGain: 58 });
    expect(result.creature?.health).toBe(Math.min(100, before.health + 10));
    expect(result.creature?.xp).toBe(before.xp + 58);
    const rows = await getDb().select().from(stepEntries).where(eq(stepEntries.userId, userId));
    expect(rows.filter((r) => r.date === today).every((r) => r.creditedSteps === r.steps)).toBe(true);

    // Next sync: +1 300 steps crosses one more thousand → XP only (health cap reached).
    const more = fakeApi([{ ...run(5, 1), sportType: "Walk" }]);
    const again = await syncStrava(userId, more.api, result.creature, minutes(16));
    expect(again.gains).toEqual({ healthGain: 0, xpGain: 2 });
  });

  it("ignores activity days before the hatch day when crediting", async () => {
    const creature = (await getActiveCreature(userId))!;
    const { api } = fakeApi([run(6, 5, `${shiftDate(today, -1)}T08:00:00Z`)]);
    const result = await syncStrava(userId, api, creature, minutes(22));
    expect(result.imported).toHaveLength(1);
    expect(result.gains).toEqual({ healthGain: 0, xpGain: 0 });
  });

  it("refreshes an expired access token before calling the API", async () => {
    await getDb().update(stravaConnections).set({ expiresAt: minutes(25) }).where(eq(stravaConnections.userId, userId));
    const { api, counters } = fakeApi([]);
    await syncStrava(userId, api, null, minutes(28));
    expect(counters.refreshed).toBe(1);
    const [row] = await getDb().select().from(stravaConnections).where(eq(stravaConnections.userId, userId));
    expect(row.accessToken).toBe("access-refreshed");
  });
});

describe("disconnect", () => {
  it("revokes the token, forgets the connection and keeps imported steps", async () => {
    const { api, counters } = fakeApi([]);
    await disconnectStrava(userId, api);
    expect(counters.deauthorized).toBe(1);
    expect((await getStravaStatus(userId)).connected).toBe(false);
    await expect(syncStrava(userId, api, null, minutes(40))).rejects.toMatchObject({ code: "not_connected" });
    const rows = await getDb().select().from(stepEntries).where(eq(stepEntries.source, "strava"));
    expect(rows.length).toBeGreaterThan(0);
    await disconnectStrava(userId, api);
    expect(counters.deauthorized).toBe(1);
  });
});
