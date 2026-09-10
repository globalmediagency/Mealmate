import { PLAY } from "./config";

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

export type PlayEffects = { moodDelta: number; xpDelta: number; perfect: boolean };

/** Effects of a finished game (spec § 3.7): +15 mood, +5 XP (+5 if perfect). */
export function playEffects(score: number): PlayEffects {
  const perfect = score >= 100;
  return { moodDelta: PLAY.moodGain, xpDelta: PLAY.xpGain + (perfect ? PLAY.xpBonusPerfect : 0), perfect };
}
