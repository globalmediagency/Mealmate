import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { playSessions } from "@/lib/db/schema";
import { DEFAULT_RULES } from "@/lib/game/rules";
import { gameDate } from "@/lib/game/time";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { countPlaysToday, recordPlay } from "./service";

let tdb: TestDatabase;
let userId: string;
const T0 = new Date();

beforeAll(async () => {
  tdb = await createTestDatabase();
  userId = await insertTestUser(tdb.db, "defender@example.com", "Defender");
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId), gameDate(T0));
  await hatchEgg(userId, T0);
  await nameCreature(userId, "Rempart");
});

afterAll(async () => {
  await tdb.close();
});

describe("defense games", () => {
  it("are recorded with their kind and share the daily limit with the food catch", async () => {
    let creature = (await getActiveCreature(userId))!;
    const first = await recordPlay(userId, creature, 80, T0, {}, DEFAULT_RULES, "defense");
    expect(first.effects.moodDelta).toBe(15);
    creature = first.creature;
    await recordPlay(userId, creature, 40, T0);
    const rows = await getDb().select({ kind: playSessions.kind, score: playSessions.score }).from(playSessions).where(eq(playSessions.creatureId, creature.id));
    expect(rows.map((r) => r.kind).sort()).toEqual(["catch", "defense"]);
    expect(await countPlaysToday(creature.id, gameDate(T0))).toBe(2);
    creature = (await getActiveCreature(userId))!;
    await recordPlay(userId, creature, 100, T0, {}, DEFAULT_RULES, "defense");
    await expect(recordPlay(userId, creature, 50, T0, {}, DEFAULT_RULES, "defense")).rejects.toMatchObject({ code: "play_limit" });
  });
});
