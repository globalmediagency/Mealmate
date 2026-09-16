import { z } from "zod";
import { ARENA, BOARDING, COACHING, DEFENSE, FEEDING, HUNGER_DAMAGE_THRESHOLD, MOOD, PLAY, TICK, TIER_CONFIG, TIERS, type Tier, type TierConfig } from "./config";

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

/** Mood effects (spec § 3.18). */
export type MoodRules = {
  happyMin: number;
  xpBonusPercent: number;
  lowMax: number;
  xpMalusPercent: number;
  gloomyMax: number;
  healthLossPerHourWhenGloomy: number;
  chestStepsBonusPercent: number;
};

/** "Défendre" difficulty (spec § 3.21). */
export type DefenseRules = {
  hp: number;
  baseSpeed: number;
  speedGrowthPercent: number;
  firstWaveEnemies: number;
  enemiesGrowthPerWave: number;
  fireCooldownMs: number;
  /** A boss closes every wave whose number is a multiple of this (0 = never). */
  bossEveryWaves: number;
  /** Eggs needed for the first boss; one more at each following boss. */
  bossHits: number;
};

export type GameRules = {
  tiers: Record<Tier, TierRules>;
  /** Hunger above which health starts dropping. */
  hungerDamageThreshold: number;
  tick: { fullRateHoursCap: number; slowRate: number };
  feeding: { maxMealsPerDay: number; rejectScreenPhotos: boolean; mealRetentionDays: number };
  boarding: BoardingRules;
  coaching: { thumbsPerStudentReward: number; thumbsPerCoachReward: number };
  mood: MoodRules;
  defense: DefenseRules;
  /** Every game together: the food catch, "Défendre" and the arena. */
  play: { maxPerDay: number };
  /** "Arène" (spec § 3.22): battle settings and the sync transport toggle. */
  arena: ArenaRules;
};

export type ArenaRules = {
  hp: number;
  eggDamage: number;
  durationSeconds: number;
  /** A direct WebRTC link between the phones on top of a slower polling (the phones fall back to polling when the link cannot open). */
  webrtc: boolean;
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
  feeding: { maxMealsPerDay: FEEDING.maxMealsPerDay, rejectScreenPhotos: FEEDING.rejectScreenPhotos, mealRetentionDays: FEEDING.mealRetentionDays },
  boarding: { maxPerHost: BOARDING.maxPerHost, cooldownMultiplier: BOARDING.cooldownMultiplier },
  coaching: { thumbsPerStudentReward: COACHING.thumbsPerStudentReward, thumbsPerCoachReward: COACHING.thumbsPerCoachReward },
  mood: { ...MOOD },
  defense: {
    hp: DEFENSE.hp,
    baseSpeed: DEFENSE.baseSpeed,
    speedGrowthPercent: DEFENSE.speedGrowthPercent,
    firstWaveEnemies: DEFENSE.firstWaveEnemies,
    enemiesGrowthPerWave: DEFENSE.enemiesGrowthPerWave,
    fireCooldownMs: DEFENSE.fireCooldownMs,
    bossEveryWaves: DEFENSE.bossEveryWaves,
    bossHits: DEFENSE.bossHits,
  },
  play: { maxPerDay: PLAY.maxPerDay },
  arena: { hp: ARENA.hp, eggDamage: ARENA.eggDamage, durationSeconds: ARENA.durationSeconds, webrtc: ARENA.webrtc },
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
    feeding: z
      .object({ maxMealsPerDay: z.coerce.number().int().min(1).max(20), rejectScreenPhotos: z.boolean(), mealRetentionDays: z.coerce.number().int().min(1).max(365) })
      .partial(),
    boarding: z.object({ maxPerHost: z.coerce.number().int().min(0).max(50), cooldownMultiplier: z.coerce.number().min(0).max(20) }).partial(),
    coaching: z.object({ thumbsPerStudentReward: z.coerce.number().int().min(1).max(100), thumbsPerCoachReward: z.coerce.number().int().min(1).max(100) }).partial(),
    mood: z
      .object({
        happyMin: z.coerce.number().min(0).max(100),
        xpBonusPercent: z.coerce.number().min(0).max(500),
        lowMax: z.coerce.number().min(0).max(100),
        xpMalusPercent: z.coerce.number().min(0).max(100),
        gloomyMax: z.coerce.number().min(0).max(100),
        healthLossPerHourWhenGloomy: z.coerce.number().min(0).max(50),
        chestStepsBonusPercent: z.coerce.number().min(0).max(500),
      })
      .partial(),
    defense: z
      .object({
        hp: z.coerce.number().int().min(10).max(1000),
        baseSpeed: z.coerce.number().min(0.05).max(3),
        speedGrowthPercent: z.coerce.number().min(0).max(200),
        firstWaveEnemies: z.coerce.number().int().min(1).max(50),
        enemiesGrowthPerWave: z.coerce.number().int().min(0).max(20),
        fireCooldownMs: z.coerce.number().int().min(0).max(5000),
        bossEveryWaves: z.coerce.number().int().min(0).max(50),
        bossHits: z.coerce.number().int().min(1).max(50),
      })
      .partial(),
    play: z.object({ maxPerDay: z.coerce.number().int().min(1).max(50) }).partial(),
    arena: z
      .object({
        hp: z.coerce.number().int().min(10).max(1000),
        eggDamage: z.coerce.number().int().min(1).max(500),
        durationSeconds: z.coerce.number().int().min(30).max(1800),
        webrtc: z.boolean(),
      })
      .partial(),
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
    coaching: { ...base.coaching, ...(patch.coaching ?? {}) },
    mood: { ...base.mood, ...(patch.mood ?? {}) },
    defense: { ...base.defense, ...(patch.defense ?? {}) },
    play: { ...base.play, ...(patch.play ?? {}) },
    arena: { ...base.arena, ...(patch.arena ?? {}) },
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
