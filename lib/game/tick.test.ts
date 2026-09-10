import { describe, expect, it } from "vitest";
import type { Creature } from "@/lib/db/schema";
import { applyTick, effectiveHours } from "./tick";

const T0 = new Date("2026-09-01T08:00:00Z");
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

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
    createdAt: new Date("2026-08-25T08:00:00Z"),
    hatchedAt: new Date("2026-08-28T08:00:00Z"),
    health: 100,
    hunger: 0,
    mood: 100,
    xp: 0,
    sickSince: null,
    protectedUntil: null,
    lastTickAt: T0,
    diedAt: null,
    deathCause: null,
    lifespanDays: null,
    mournedAt: null,
    ...overrides,
  };
}

describe("effectiveHours", () => {
  it("is linear up to 72 h then 25 %", () => {
    expect(effectiveHours(10)).toBe(10);
    expect(effectiveHours(72)).toBe(72);
    expect(effectiveHours(172)).toBe(72 + 25);
    expect(effectiveHours(-5)).toBe(0);
  });
});

describe("applyTick", () => {
  it("does nothing for eggs, dead creatures or when no time elapsed", () => {
    expect(applyTick(creature({ status: "egg" }), hours(5)).changed).toBe(false);
    expect(applyTick(creature({ status: "dead" }), hours(5)).changed).toBe(false);
    expect(applyTick(creature(), T0).changed).toBe(false);
  });

  it("raises hunger and lowers mood, health untouched while hunger ≤ 80", () => {
    const { creature: c } = applyTick(creature(), hours(10));
    expect(c.hunger).toBeCloseTo(20); // facile: +2/h
    expect(c.mood).toBeCloseTo(95); // −0.5/h
    expect(c.health).toBe(100);
    expect(c.lastTickAt).toEqual(hours(10));
  });

  it("starts damaging health only after hunger crosses 80", () => {
    // facile: hunger reaches 80 after 40 h; then −0.5 health/h.
    const { creature: c } = applyTick(creature(), hours(50));
    expect(c.hunger).toBe(100);
    expect(c.health).toBeCloseTo(100 - 0.5 * 10);
  });

  it("uses the tier rates (difficile is harsher)", () => {
    const { creature: c } = applyTick(creature({ tier: "difficile" }), hours(30));
    // hunger 80 after 20 h, then 10 h × 1.5 = 15 health lost; mood −1.5/h.
    expect(c.health).toBeCloseTo(85);
    expect(c.mood).toBeCloseTo(55);
  });

  it("slows degradation beyond 72 h (25 % rate)", () => {
    const { creature: c } = applyTick(creature(), hours(172));
    // effective 97 h → starving 57 h → −28.5 health.
    expect(c.health).toBeCloseTo(71.5);
  });

  it("sets sickSince when health drops under 30 and estimates the crossing time", () => {
    const start = creature({ hunger: 100, health: 35 });
    const { creature: c } = applyTick(start, hours(20)); // −10 health → 25
    expect(c.health).toBeCloseTo(25);
    expect(c.sickSince).not.toBeNull();
    // crossed 30 ten hours before now
    expect(c.sickSince?.getTime()).toBeCloseTo(hours(10).getTime(), -4);
  });

  it("clears sickSince when health is back above 30", () => {
    const { creature: c } = applyTick(creature({ health: 80, sickSince: hours(-30) }), hours(1));
    expect(c.sickSince).toBeNull();
  });

  it("kills after the tier's sick days (facile = 7)", () => {
    const sickSince = hours(-7 * 24);
    const start = creature({ hunger: 100, health: 10, sickSince });
    const { creature: c, died } = applyTick(start, hours(1));
    expect(died).toBe(true);
    expect(c.status).toBe("dead");
    expect(c.deathCause).toBe("sickness");
    expect(c.diedAt).toEqual(hours(1));
    expect(c.lifespanDays).toBe(4);
  });

  it("does not kill before the sick days elapsed", () => {
    const start = creature({ hunger: 100, health: 10, sickSince: hours(-3 * 24) });
    expect(applyTick(start, hours(1)).died).toBe(false);
  });

  it("a talisman prevents death", () => {
    const start = creature({ hunger: 100, health: 5, sickSince: hours(-10 * 24), protectedUntil: hours(48) });
    const result = applyTick(start, hours(1));
    expect(result.died).toBe(false);
    expect(result.creature.status).toBe("alive");
  });

  it("dies in ~13 days without any care on the easy tier", () => {
    let c = creature();
    let died = false;
    let day = 0;
    while (!died && day < 40) {
      day += 1;
      const r = applyTick(c, hours(day * 24));
      c = r.creature;
      died = r.died;
    }
    expect(died).toBe(true);
    expect(day).toBeGreaterThanOrEqual(12);
    expect(day).toBeLessThanOrEqual(15);
  });
});
