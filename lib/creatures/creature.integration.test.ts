import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/api/errors";
import { toCreatureView } from "@/lib/game/creature-view";
import { gameDate } from "@/lib/game/time";
import { getStepHistory, saveManualSteps, sumStepsSince } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import {
  applyStepGains,
  createEgg,
  getActiveCreature,
  getObtainedSpeciesIds,
  hatchEgg,
  nameCreature,
  refreshEggSteps,
} from "./service";

let tdb: TestDatabase;
let userId: string;

beforeAll(async () => {
  tdb = await createTestDatabase();
  userId = await insertTestUser(tdb.db, "egg@example.com");
});

afterAll(async () => {
  await tdb.close();
});

describe("egg lifecycle", () => {
  it("starts with no creature", async () => {
    expect(await getActiveCreature(userId)).toBeNull();
  });

  it("refuses a tier without species", async () => {
    await expect(createEgg(userId, "difficile")).rejects.toBeInstanceOf(DomainError);
  });

  it("creates an easy egg and refuses a second one", async () => {
    const egg = await createEgg(userId, "facile");
    expect(egg.status).toBe("egg");
    expect(egg.eggSteps).toBe(0);
    await expect(createEgg(userId, "facile")).rejects.toMatchObject({ code: "creature_exists" });
  });

  it("cannot hatch before the goal", async () => {
    await expect(hatchEgg(userId)).rejects.toMatchObject({ code: "egg_not_ready" });
  });

  it("counts today's manual steps toward the egg, and editing replaces the value", async () => {
    const egg = (await getActiveCreature(userId))!;
    await saveManualSteps(userId, 9000, egg);
    expect(await sumStepsSince(userId, gameDate())).toBe(9000);
    await saveManualSteps(userId, 15_000, egg);
    expect(await sumStepsSince(userId, gameDate())).toBe(15_000);
    const refreshed = await refreshEggSteps(egg);
    expect(refreshed.eggSteps).toBe(15_000);
    expect(toCreatureView(refreshed).canHatch).toBe(true);
  });

  it("hatches into a species of the tier, then gets named once", async () => {
    const born = await hatchEgg(userId);
    expect(born.status).toBe("alive");
    expect(born.speciesId?.startsWith("facile-")).toBe(true);
    expect(born.rarity).toBeTruthy();
    expect(born.name).toBeNull();
    expect(born.health).toBe(100);

    const named = await nameCreature(userId, "Miso");
    expect(named.name).toBe("Miso");
    await expect(nameCreature(userId, "Autre")).rejects.toMatchObject({ code: "already_named" });
    expect(await getObtainedSpeciesIds(userId)).toEqual([born.speciesId]);
  });

  it("credits walking to the living creature without double counting", async () => {
    const creature = (await getActiveCreature(userId))!;
    // Today's entry already holds 15 000 steps but nothing was credited while it was an egg.
    const first = await saveManualSteps(userId, 15_000, creature);
    expect(first.gains).toEqual({ healthGain: 10, xpGain: 30 });
    const after = await applyStepGains(creature, first.gains);
    expect(after.health).toBe(100); // capped
    expect(after.xp).toBe(30);

    const second = await saveManualSteps(userId, 16_500, after);
    expect(second.gains).toEqual({ healthGain: 0, xpGain: 2 });
    const third = await saveManualSteps(userId, 16_500, after);
    expect(third.gains).toEqual({ healthGain: 0, xpGain: 0 });
  });

  it("returns a zero-filled 14-day history ending today", async () => {
    const history = await getStepHistory(userId, 14);
    expect(history).toHaveLength(14);
    expect(history[13].date).toBe(gameDate());
    expect(history[13].steps).toBe(16_500);
    expect(history[0].steps).toBe(0);
  });
});
