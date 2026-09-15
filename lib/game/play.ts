import { PLAY } from "./config";
import { applyMoodToXp, moodXpMultiplier } from "./mood";
import { DEFAULT_RULES, type GameRules } from "./rules";

export type PlaySummary = {
  healthySpawned: number;
  healthyCaught: number;
  junkHit: number;
};

/** Score 0–100 from a game summary: catch ratio minus 10 per junk item. */
export function computePlayScore(summary: PlaySummary): { score: number; perfect: boolean } {
  const spawned = Math.max(0, Math.floor(summary.healthySpawned));
  const caught = Math.max(0, Math.min(spawned, Math.floor(summary.healthyCaught)));
  const junk = Math.max(0, Math.floor(summary.junkHit));
  const ratio = spawned > 0 ? caught / spawned : 0;
  const score = Math.max(0, Math.min(100, Math.round(ratio * 100 - junk * 10)));
  return { score, perfect: spawned > 0 && caught === spawned && junk === 0 };
}

export type PlayEffects = {
  moodDelta: number;
  xpDelta: number;
  perfect: boolean;
  /** Mood multiplier already applied to `xpDelta` (based on the mood before the game; 1 when no mood was given). */
  xpMultiplier: number;
};

/** Effects of a finished game (spec § 3.7): +15 mood, +5 XP (+5 if perfect), XP scaled by the mood before playing (§ 3.18). */
export function playEffects(score: number, mood?: number, rules: GameRules = DEFAULT_RULES): PlayEffects {
  const perfect = score >= 100;
  const baseXp = PLAY.xpGain + (perfect ? PLAY.xpBonusPerfect : 0);
  return {
    moodDelta: PLAY.moodGain,
    xpDelta: mood === undefined ? baseXp : applyMoodToXp(baseXp, mood, rules.mood),
    perfect,
    xpMultiplier: mood === undefined ? 1 : moodXpMultiplier(mood, rules.mood),
  };
}
