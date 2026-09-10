import type { Creature } from "@/lib/db/schema";
import { HEALTH_STATE, type Tier } from "./config";
import { DEFAULT_RULES, type GameRules } from "./rules";
import { daysBetween, hoursBetween } from "./time";

const HOUR_MS = 3_600_000;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Real elapsed hours → "effective" degradation hours: full rate up to the cap,
 * then 25 % of the rate beyond it (spec § 3.4).
 */
export function effectiveHours(elapsedHours: number, tick: GameRules["tick"] = DEFAULT_RULES.tick): number {
  if (elapsedHours <= 0) return 0;
  const capped = Math.min(elapsedHours, tick.fullRateHoursCap);
  const beyond = Math.max(0, elapsedHours - tick.fullRateHoursCap);
  return capped + beyond * tick.slowRate;
}

export type TickResult = {
  creature: Creature;
  /** True when at least one field changed. */
  changed: boolean;
  /** True when the creature died during this tick. */
  died: boolean;
};

/**
 * Pure lazy tick: applies hunger, health and mood decay between
 * `creature.lastTickAt` and `now`, manages `sickSince` and death.
 */
export function applyTick(creature: Creature, now: Date = new Date(), rules: GameRules = DEFAULT_RULES): TickResult {
  if (creature.status !== "alive") return { creature, changed: false, died: false };

  const elapsed = hoursBetween(creature.lastTickAt, now);
  if (elapsed <= 0) return { creature, changed: false, died: false };

  const tier = rules.tiers[creature.tier as Tier];
  const threshold = rules.hungerDamageThreshold;
  const t = effectiveHours(elapsed, rules.tick);

  // Hunger rises linearly (0 = full, 100 = starving).
  const hunger0 = creature.hunger;
  const hunger = clamp(hunger0 + tier.hungerPerHour * t, 0, 100);

  // Health only drops while hunger is above the damage threshold.
  const hoursUntilStarving =
    hunger0 >= threshold ? 0 : tier.hungerPerHour > 0 ? (threshold - hunger0) / tier.hungerPerHour : Number.POSITIVE_INFINITY;
  const starvingHours = Math.max(0, t - hoursUntilStarving);
  const health = clamp(creature.health - tier.healthLossPerHourWhenStarving * starvingHours, 0, 100);

  const mood = clamp(creature.mood - tier.moodLossPerHour * t, 0, 100);

  // Sickness bookkeeping.
  let sickSince = creature.sickSince;
  if (health < HEALTH_STATE.tiredMin) {
    if (!sickSince) {
      // Estimate when health crossed the threshold (never before the last tick).
      const hoursBelow =
        tier.healthLossPerHourWhenStarving > 0 ? (HEALTH_STATE.tiredMin - health) / tier.healthLossPerHourWhenStarving : 0;
      const estimate = new Date(now.getTime() - hoursBelow * HOUR_MS);
      sickSince = estimate < creature.lastTickAt ? creature.lastTickAt : estimate;
    }
  } else {
    sickSince = null;
  }

  // Death after N consecutive sick days, unless a talisman protects.
  const protectedNow = creature.protectedUntil !== null && creature.protectedUntil > now;
  const sickHours = sickSince ? hoursBetween(sickSince, now) : 0;
  const died = !protectedNow && sickSince !== null && sickHours >= tier.sickDaysBeforeDeath * 24;

  const next: Creature = {
    ...creature,
    hunger,
    health,
    mood,
    sickSince,
    lastTickAt: now,
    ...(died
      ? {
          status: "dead" as const,
          diedAt: now,
          deathCause: "sickness",
          lifespanDays: creature.hatchedAt ? daysBetween(creature.hatchedAt, now) : 0,
        }
      : {}),
  };

  return { creature: next, changed: true, died };
}
