import { z } from "zod";
import { BOARDING, FEEDING, HUNGER_DAMAGE_THRESHOLD, TICK, TIER_CONFIG, TIERS, type Tier, type TierConfig } from "./config";

/** Per-tier demands that the admin can tune (spec § 3.1). */
export type TierRules = Pick<
  TierConfig,
  | "hatchSteps"
  | "healthyScoreThreshold"
  | "hungerPerHour"
  | "healthLossPerHourWhenStarving"
  | "moodLossPerHour"
  | "sickDaysBeforeDeath"
  | "boardingMaxDays"
>;

export type BoardingRules = {
  /** Creatures one player can host at the same time. */
  maxPerHost: number;
  /** After a stay of X days, the owner cannot lend again for X × this (0 = no wait). */
  cooldownMultiplier: number;
};

export type GameRules = {
  tiers: Record<Tier, TierRules>;
  /** Hunger above which health starts dropping. */
  hungerDamageThreshold: number;
  tick: { fullRateHoursCap: number; slowRate: number };
  feeding: { maxMealsPerDay: number; rejectScreenPhotos: boolean };
  boarding: BoardingRules;
};

const pickTier = (config: TierConfig): TierRules => ({
  hatchSteps: config.hatchSteps,
  healthyScoreThreshold: config.healthyScoreThreshold,
  hungerPerHour: config.hungerPerHour,
  healthLossPerHourWhenStarving: config.healthLossPerHourWhenStarving,
  moodLossPerHour: config.moodLossPerHour,
  sickDaysBeforeDeath: config.sickDaysBeforeDeath,
  boardingMaxDays: config.boardingMaxDays,
});

/** Defaults = the constants of lib/game/config.ts. */
export const DEFAULT_RULES: GameRules = {
  tiers: {
    facile: pickTier(TIER_CONFIG.facile),
    moyen: pickTier(TIER_CONFIG.moyen),
    difficile: pickTier(TIER_CONFIG.difficile),
  },
  hungerDamageThreshold: HUNGER_DAMAGE_THRESHOLD,
  tick: { fullRateHoursCap: TICK.fullRateHoursCap, slowRate: TICK.slowRate },
  feeding: { maxMealsPerDay: FEEDING.maxMealsPerDay, rejectScreenPhotos: FEEDING.rejectScreenPhotos },
  boarding: { maxPerHost: BOARDING.maxPerHost, cooldownMultiplier: BOARDING.cooldownMultiplier },
};

const tierRulesSchema = z
  .object({
    hatchSteps: z.coerce.number().int().min(100).max(1_000_000),
    healthyScoreThreshold: z.coerce.number().int().min(0).max(100),
    hungerPerHour: z.coerce.number().min(0).max(50),
    healthLossPerHourWhenStarving: z.coerce.number().min(0).max(50),
    moodLossPerHour: z.coerce.number().min(0).max(50),
    sickDaysBeforeDeath: z.coerce.number().min(0.5).max(365),
    boardingMaxDays: z.coerce.number().int().min(1).max(BOARDING.absoluteMaxDays),
  })
  .partial();

/** Accepts a partial document (as stored in the DB or sent by the admin form). */
export const gameRulesPatchSchema = z
  .object({
    tiers: z
      .object({ facile: tierRulesSchema, moyen: tierRulesSchema, difficile: tierRulesSchema })
      .partial(),
    hungerDamageThreshold: z.coerce.number().min(0).max(100),
    tick: z.object({ fullRateHoursCap: z.coerce.number().min(1).max(8760), slowRate: z.coerce.number().min(0).max(1) }).partial(),
    feeding: z.object({ maxMealsPerDay: z.coerce.number().int().min(1).max(20), rejectScreenPhotos: z.boolean() }).partial(),
    boarding: z.object({ maxPerHost: z.coerce.number().int().min(0).max(50), cooldownMultiplier: z.coerce.number().min(0).max(20) }).partial(),
  })
  .partial();

export type GameRulesPatch = z.infer<typeof gameRulesPatchSchema>;

/** Merges a validated patch over the defaults (unknown keys are ignored). */
export function mergeRules(patch: GameRulesPatch | null | undefined, base: GameRules = DEFAULT_RULES): GameRules {
  if (!patch) return base;
  const tiers = Object.fromEntries(
    TIERS.map((tier) => [tier, { ...base.tiers[tier], ...(patch.tiers?.[tier] ?? {}) }]),
  ) as Record<Tier, TierRules>;
  return {
    tiers,
    hungerDamageThreshold: patch.hungerDamageThreshold ?? base.hungerDamageThreshold,
    tick: { ...base.tick, ...(patch.tick ?? {}) },
    feeding: { ...base.feeding, ...(patch.feeding ?? {}) },
    boarding: { ...base.boarding, ...(patch.boarding ?? {}) },
  };
}

/** Parses an untrusted document into rules (invalid → defaults). */
export function rulesFromDocument(document: unknown): GameRules {
  const parsed = gameRulesPatchSchema.safeParse(document ?? {});
  return mergeRules(parsed.success ? parsed.data : null);
}

export type NeglectTimeline = {
  /** Hours until hunger crosses the damage threshold (from a full creature). */
  hoursToStarving: number;
  /** Hours until health drops under 30 (sick), assuming no care. */
  hoursToSick: number;
  /** Days until death, assuming no care at all (continuous full-rate time). */
  daysToDeath: number;
};

/**
 * What happens to a brand-new, never-fed creature. Uses the continuous
 * formulas of the tick at full rate (the 72 h cap only matters when the
 * app is not opened at all, which slows things further).
 */
export function simulateNeglect(rules: GameRules, tier: Tier): NeglectTimeline {
  const t = rules.tiers[tier];
  const hoursToStarving = t.hungerPerHour > 0 ? rules.hungerDamageThreshold / t.hungerPerHour : Number.POSITIVE_INFINITY;
  const hoursToSick =
    t.healthLossPerHourWhenStarving > 0 ? hoursToStarving + (100 - 30) / t.healthLossPerHourWhenStarving : Number.POSITIVE_INFINITY;
  const daysToDeath = Number.isFinite(hoursToSick) ? hoursToSick / 24 + t.sickDaysBeforeDeath : Number.POSITIVE_INFINITY;
  return { hoursToStarving, hoursToSick, daysToDeath };
}

export const TIER_RULE_LABELS: Record<keyof TierRules, { label: string; unit: string; help: string }> = {
  hatchSteps: { label: "Pas pour éclore", unit: "pas", help: "Pas cumulés depuis le choix de l'œuf." },
  healthyScoreThreshold: { label: "Seuil repas sain", unit: "/100", help: "Score Gemini à partir duquel un repas fait du bien." },
  hungerPerHour: { label: "Faim par heure", unit: "pts/h", help: "0 = repue, 100 = affamée." },
  healthLossPerHourWhenStarving: { label: "Perte de santé par heure", unit: "pts/h", help: "Seulement quand la faim dépasse le seuil de dommage." },
  moodLossPerHour: { label: "Perte d'humeur par heure", unit: "pts/h", help: "L'humeur remonte en jouant et en mangeant." },
  sickDaysBeforeDeath: { label: "Jours malade avant la mort", unit: "jours", help: "Jours consécutifs sous 30 de santé." },
  boardingMaxDays: { label: "Pension maximale", unit: "jours", help: "Durée la plus longue pendant laquelle on peut confier cette créature à un ami." },
};
