import { FEEDING, type Tier } from "./config";
import { DEFAULT_RULES, type GameRules } from "./rules";

export type MealEffects = {
  healthDelta: number;
  hungerDelta: number;
  moodDelta: number;
  xpDelta: number;
  /** Score at or above the tier threshold. */
  healthy: boolean;
  /** Creature was already full (hunger < 15): health effect halved. */
  full: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Effects of a meal on the creature (spec § 3.5). */
export function mealEffects(input: { score: number; tier: Tier; hunger: number; rules?: GameRules }): MealEffects {
  const threshold = (input.rules ?? DEFAULT_RULES).tiers[input.tier].healthyScoreThreshold;
  const healthy = input.score >= threshold;
  const full = input.hunger < FEEDING.fullHungerThreshold;
  const raw = (input.score - threshold) / FEEDING.healthDeltaDivisor;
  const clamped = Math.max(FEEDING.healthDeltaMin, Math.min(FEEDING.healthDeltaMax, raw));
  return {
    healthDelta: round1(full ? clamped / 2 : clamped),
    hungerDelta: -FEEDING.hungerReduction,
    moodDelta: FEEDING.moodGain,
    xpDelta: FEEDING.xpGain + (healthy ? FEEDING.xpBonusHealthy : 0),
    healthy,
    full,
  };
}
