import { getSpecies, toSpeciesSummary, type SpeciesSummary } from "@/lib/creatures";
import type { Creature } from "@/lib/db/schema";
import { HEALTH_STATE, type Rarity, type Tier } from "./config";
import { stageForXp, xpToNextStage, type Stage } from "./growth";
import { moodBand, moodXpMultiplier, type MoodBand } from "./mood";
import { DEFAULT_RULES, type GameRules } from "./rules";
import { hatchProgress } from "./steps";
import { daysBetween, hoursBetween } from "./time";

export type CreatureState = "healthy" | "tired" | "sick" | "dead";
export type CreatureStatus = "egg" | "alive" | "dead";

/** Visual state derived from status and health (spec § 3.3). */
export function deriveState(creature: { status: string; health: number }): CreatureState {
  if (creature.status === "dead") return "dead";
  if (creature.health >= HEALTH_STATE.healthyMin) return "healthy";
  if (creature.health >= HEALTH_STATE.tiredMin) return "tired";
  return "sick";
}

export type CreatureView = {
  id: string;
  status: CreatureStatus;
  tier: Tier;
  name: string | null;
  species: SpeciesSummary | null;
  rarity: Rarity | null;
  eggSteps: number;
  hatchSteps: number;
  hatchProgress: number;
  canHatch: boolean;
  health: number;
  hunger: number;
  mood: number;
  xp: number;
  stage: Stage;
  xpToNextStage: number | null;
  state: CreatureState;
  ageDays: number;
  createdAt: string;
  hatchedAt: string | null;
  diedAt: string | null;
  lifespanDays: number | null;
  /** Care information (rules-dependent). */
  sickSince: string | null;
  /** Days left before death while sick (fractional, ≥ 0), null when not sick. */
  daysUntilDeath: number | null;
  protectedUntil: string | null;
  sickDaysBeforeDeath: number;
  hungerDamageThreshold: number;
  healthyScoreThreshold: number;
  /** Mood effects currently in force (spec § 3.18), for the gauge caption and help text. */
  moodBand: MoodBand;
  moodEffects: MoodEffects;
};

export type MoodEffects = {
  /** XP change in percent applied right now (+25, 0, −25…). */
  xpPercent: number;
  /** Extra chest steps in percent applied right now (10 or 0). */
  chestBonusPercent: number;
  /** Health lost per hour right now because of a gloomy mood (0 when not gloomy). */
  healthLossPerHour: number;
  /** Thresholds, to explain the rule. */
  happyMin: number;
  lowMax: number;
  gloomyMax: number;
  xpBonusPercent: number;
  xpMalusPercent: number;
  chestStepsBonusPercent: number;
  gloomyHealthLossPerHour: number;
};

/** Mood effects of a living creature under the given rules (all zero for eggs and dead creatures). */
export function moodEffectsFor(creature: Pick<Creature, "status" | "mood">, rules: GameRules = DEFAULT_RULES): MoodEffects {
  const m = rules.mood;
  const alive = creature.status === "alive";
  const band = moodBand(creature.mood, m);
  return {
    xpPercent: alive ? Math.round((moodXpMultiplier(creature.mood, m) - 1) * 1000) / 10 : 0,
    chestBonusPercent: alive && band === "happy" ? m.chestStepsBonusPercent : 0,
    healthLossPerHour: alive && band === "gloomy" ? m.healthLossPerHourWhenGloomy : 0,
    happyMin: m.happyMin,
    lowMax: m.lowMax,
    gloomyMax: m.gloomyMax,
    xpBonusPercent: m.xpBonusPercent,
    xpMalusPercent: m.xpMalusPercent,
    chestStepsBonusPercent: m.chestStepsBonusPercent,
    gloomyHealthLossPerHour: m.healthLossPerHourWhenGloomy,
  };
}

/** Client-safe projection of a creature row. */
export function toCreatureView(creature: Creature, now: Date = new Date(), rules: GameRules = DEFAULT_RULES): CreatureView {
  const tier = creature.tier as Tier;
  const tierRules = rules.tiers[tier];
  const species = creature.speciesId ? getSpecies(creature.speciesId) : undefined;
  const progress = hatchProgress(creature.eggSteps, tier, rules);
  const round = (n: number) => Math.round(n * 10) / 10;
  const sick = creature.status === "alive" && creature.sickSince !== null;
  const daysUntilDeath = sick
    ? Math.max(0, round(tierRules.sickDaysBeforeDeath - hoursBetween(creature.sickSince!, now) / 24))
    : null;
  return {
    id: creature.id,
    status: creature.status as CreatureStatus,
    tier,
    name: creature.name,
    species: species ? toSpeciesSummary(species) : null,
    rarity: (creature.rarity as Rarity | null) ?? null,
    eggSteps: creature.eggSteps,
    hatchSteps: tierRules.hatchSteps,
    hatchProgress: progress,
    canHatch: creature.status === "egg" && progress >= 1,
    health: round(creature.health),
    hunger: round(creature.hunger),
    mood: round(creature.mood),
    xp: creature.xp,
    stage: stageForXp(creature.xp),
    xpToNextStage: xpToNextStage(creature.xp),
    state: deriveState(creature),
    ageDays: creature.hatchedAt ? daysBetween(creature.hatchedAt, creature.diedAt ?? now) : 0,
    createdAt: creature.createdAt.toISOString(),
    hatchedAt: creature.hatchedAt?.toISOString() ?? null,
    diedAt: creature.diedAt?.toISOString() ?? null,
    lifespanDays: creature.lifespanDays,
    sickSince: creature.sickSince?.toISOString() ?? null,
    daysUntilDeath,
    protectedUntil: creature.protectedUntil?.toISOString() ?? null,
    sickDaysBeforeDeath: tierRules.sickDaysBeforeDeath,
    hungerDamageThreshold: rules.hungerDamageThreshold,
    healthyScoreThreshold: tierRules.healthyScoreThreshold,
    moodBand: moodBand(creature.mood, rules.mood),
    moodEffects: moodEffectsFor(creature, rules),
  };
}
