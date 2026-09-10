import { describe, expect, it } from "vitest";
import type { Creature } from "@/lib/db/schema";
import { deriveState, toCreatureView } from "./creature-view";

function creature(overrides: Partial<Creature> = {}): Creature {
  return {
    id: "c1",
    userId: "u1",
    tier: "facile",
    status: "alive",
    speciesId: "facile-chat-rond",
    rarity: "commun",
    name: "Miso",
    eggSteps: 15000,
    createdAt: new Date("2026-09-01T08:00:00Z"),
    hatchedAt: new Date("2026-09-03T08:00:00Z"),
    health: 100,
    hunger: 0,
    mood: 100,
    xp: 0,
    sickSince: null,
    protectedUntil: null,
    lastTickAt: new Date("2026-09-03T08:00:00Z"),
    diedAt: null,
    deathCause: null,
    lifespanDays: null,
    ...overrides,
  };
}

describe("deriveState", () => {
  it("follows the health thresholds", () => {
    expect(deriveState({ status: "alive", health: 60 })).toBe("healthy");
    expect(deriveState({ status: "alive", health: 59.9 })).toBe("tired");
    expect(deriveState({ status: "alive", health: 30 })).toBe("tired");
    expect(deriveState({ status: "alive", health: 29.9 })).toBe("sick");
    expect(deriveState({ status: "dead", health: 100 })).toBe("dead");
  });
});

describe("toCreatureView", () => {
  it("projects a living creature", () => {
    const view = toCreatureView(creature(), new Date("2026-09-10T12:00:00Z"));
    expect(view.species?.name).toBe("Chabond");
    expect(view.stage.id).toBe("bebe");
    expect(view.ageDays).toBe(7);
    expect(view.state).toBe("healthy");
    expect(view.canHatch).toBe(false);
  });

  it("projects an egg with its hatch progress", () => {
    const view = toCreatureView(
      creature({ status: "egg", speciesId: null, rarity: null, name: null, hatchedAt: null, eggSteps: 7500 }),
    );
    expect(view.species).toBeNull();
    expect(view.hatchProgress).toBeCloseTo(0.5);
    expect(view.hatchSteps).toBe(15000);
    expect(view.canHatch).toBe(false);
    expect(view.ageDays).toBe(0);
  });

  it("flags an egg ready to hatch", () => {
    const view = toCreatureView(creature({ status: "egg", speciesId: null, eggSteps: 15000, hatchedAt: null }));
    expect(view.canHatch).toBe(true);
  });
});
