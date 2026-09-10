import { STEPS, type Tier } from "./config";
import { DEFAULT_RULES, type GameRules } from "./rules";

export type StepCredit = {
  /** Health points to add to the living creature. */
  healthGain: number;
  /** XP to add. */
  xpGain: number;
  /** New value to store as `credited_steps` for the day. */
  credited: number;
};

/**
 * Converts the day's step total into creature effects, given how many steps
 * were already credited today. Every 1 000 steps = +1 health (max +10/day)
 * and +2 XP. Lowering the total never removes effects.
 */
export function stepCredit(totalToday: number, creditedSoFar: number): StepCredit {
  const total = Math.max(0, Math.floor(totalToday));
  const credited = Math.max(0, Math.floor(creditedSoFar));
  if (total <= credited) return { healthGain: 0, xpGain: 0, credited };

  const per = 1000;
  const newThousands = Math.floor(total / per) - Math.floor(credited / per);
  const healthCap = STEPS.maxHealthPerDay / STEPS.healthPerThousandSteps;
  const healthThousands =
    Math.min(Math.floor(total / per), healthCap) - Math.min(Math.floor(credited / per), healthCap);

  return {
    healthGain: Math.max(0, healthThousands) * STEPS.healthPerThousandSteps,
    xpGain: Math.max(0, newThousands) * STEPS.xpPerThousandSteps,
    credited: total,
  };
}

/** Fraction (0–1) of the hatch goal reached by the egg. */
export function hatchProgress(eggSteps: number, tier: Tier, rules: GameRules = DEFAULT_RULES): number {
  const goal = rules.tiers[tier].hatchSteps;
  return Math.max(0, Math.min(1, eggSteps / goal));
}

/** Crack level of the egg shell: 0 (intact) … 3 (75 %), 4 when ready. */
export function crackLevel(progress: number): 0 | 1 | 2 | 3 | 4 {
  if (progress >= 1) return 4;
  if (progress >= 0.75) return 3;
  if (progress >= 0.5) return 2;
  if (progress >= 0.25) return 1;
  return 0;
}

/** Clamps a manual daily entry to the allowed range. */
export function clampManualSteps(steps: number): number {
  if (!Number.isFinite(steps)) return 0;
  return Math.max(0, Math.min(STEPS.maxManualPerDay, Math.round(steps)));
}
