import { describe, expect, it } from "vitest";
import type { Creature } from "@/lib/db/schema";
import { applyMedicine, medicineIsUseful, needsCare } from "./medicine";

const now = new Date("2026-03-01T12:00:00Z");

function creature(overrides: Partial<Creature> = {}): Creature {
  return {
    id: "c1",
    userId: "u1",
    tier: "facile",
    status: "alive",
    speciesId: "facile-noisette",
    rarity: "commun",
    name: "Pixel",
    eggSteps: 0,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    hatchedAt: new Date("2026-02-02T00:00:00Z"),
    health: 20,
    hunger: 80,
    mood: 40,
    xp: 0,
    sickSince: new Date("2026-02-28T00:00:00Z"),
    protectedUntil: null,
    lastTickAt: now,
    diedAt: null,
    deathCause: null,
    lifespanDays: null,
    mournedAt: null,
    accessoryDrops: 0,
    ...overrides,
  };
}

describe("applyMedicine", () => {
  it("sirop adds 30 health, capped at 100, and cures when back above the tired line", () => {
    const result = applyMedicine(creature({ health: 20 }), "sirop", now);
    expect(result.creature.health).toBe(50);
    expect(result.healthDelta).toBe(30);
    expect(result.cured).toBe(true);
    expect(result.creature.sickSince).toBeNull();

    const capped = applyMedicine(creature({ health: 85, sickSince: null }), "sirop", now);
    expect(capped.creature.health).toBe(100);
    expect(capped.healthDelta).toBe(15);
    expect(capped.cured).toBe(false);
  });

  it("sirop keeps the sickness when health stays under 30", () => {
    const result = applyMedicine(creature({ health: 0 }), "sirop", now);
    expect(result.creature.health).toBe(30);
    expect(result.creature.sickSince).toBeNull();
    const still = applyMedicine(creature({ health: -0.5 }), "sirop", now);
    expect(still.creature.health).toBe(29.5);
    expect(still.creature.sickSince).not.toBeNull();
    expect(still.cured).toBe(false);
  });

  it("antibiotique sets health to 100 and ends the sickness", () => {
    const result = applyMedicine(creature({ health: 5 }), "antibiotique", now);
    expect(result.creature.health).toBe(100);
    expect(result.healthDelta).toBe(95);
    expect(result.cured).toBe(true);
    expect(result.creature.sickSince).toBeNull();
  });

  it("talisman protects for 7 days and extends an active protection", () => {
    const first = applyMedicine(creature(), "talisman", now);
    expect(first.protectedUntil?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
    expect(first.creature.health).toBe(20);
    const second = applyMedicine(first.creature, "talisman", now);
    expect(second.protectedUntil?.toISOString()).toBe("2026-03-15T12:00:00.000Z");
    const expired = applyMedicine(creature({ protectedUntil: new Date("2026-01-01T00:00:00Z") }), "talisman", now);
    expect(expired.protectedUntil?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
  });

  it("does nothing on a dead creature", () => {
    const dead = creature({ status: "dead", health: 0 });
    expect(applyMedicine(dead, "antibiotique", now).creature).toBe(dead);
  });
});

describe("helpers", () => {
  it("flags useless doses and creatures that need care", () => {
    expect(medicineIsUseful(creature({ health: 100 }), "sirop")).toBe(false);
    expect(medicineIsUseful(creature({ health: 100 }), "talisman")).toBe(true);
    expect(medicineIsUseful(creature({ health: 99 }), "antibiotique")).toBe(true);
    expect(needsCare(creature({ health: 59 }))).toBe(true);
    expect(needsCare(creature({ health: 60 }))).toBe(false);
    expect(needsCare(creature({ status: "dead", health: 0 }))).toBe(false);
  });
});
