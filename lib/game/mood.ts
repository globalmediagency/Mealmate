import { DEFAULT_RULES, type MoodRules } from "./rules";

/** Mood band of a creature (spec § 3.18): thresholds come from the admin rules. */
export type MoodBand = "happy" | "neutral" | "low" | "gloomy";

export function moodBand(mood: number, rules: MoodRules = DEFAULT_RULES.mood): MoodBand {
  if (mood < rules.gloomyMax) return "gloomy";
  if (mood < rules.lowMax) return "low";
  if (mood >= rules.happyMin) return "happy";
  return "neutral";
}

/** Multiplier applied to every XP gain (meals, games, steps): +bonus when happy, −malus when low or gloomy. */
export function moodXpMultiplier(mood: number, rules: MoodRules = DEFAULT_RULES.mood): number {
  const band = moodBand(mood, rules);
  if (band === "happy") return 1 + rules.xpBonusPercent / 100;
  if (band === "low" || band === "gloomy") return Math.max(0, 1 - rules.xpMalusPercent / 100);
  return 1;
}

/** XP actually gained: base × mood multiplier, rounded (a positive base never drops to 0 unless the malus is 100 %). */
export function applyMoodToXp(baseXp: number, mood: number, rules: MoodRules = DEFAULT_RULES.mood): number {
  if (baseXp <= 0) return 0;
  const multiplier = moodXpMultiplier(mood, rules);
  if (multiplier <= 0) return 0;
  return Math.max(1, Math.round(baseXp * multiplier));
}

/** Extra chest steps earned on `steps` newly credited to a happy creature (0 otherwise). */
export function chestBonusSteps(steps: number, mood: number, rules: MoodRules = DEFAULT_RULES.mood): number {
  if (steps <= 0 || moodBand(mood, rules) !== "happy") return 0;
  return Math.floor(steps * (rules.chestStepsBonusPercent / 100));
}

/** Hours (within `t` effective hours) spent under the gloomy threshold, mood decaying linearly from `mood0`. */
export function gloomyHours(mood0: number, moodLossPerHour: number, t: number, rules: MoodRules = DEFAULT_RULES.mood): number {
  if (t <= 0) return 0;
  if (mood0 < rules.gloomyMax) return t;
  if (moodLossPerHour <= 0) return 0;
  const hoursUntilGloomy = (mood0 - rules.gloomyMax) / moodLossPerHour;
  return Math.max(0, t - hoursUntilGloomy);
}

export const MOOD_BAND_LABELS: Record<MoodBand, string> = {
  happy: "Ravie",
  neutral: "Ça va",
  low: "Morose",
  gloomy: "Triste",
};

/** Percent formatted for the UI: 25 → "+25 %", −25 → "−25 %". */
export function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toLocaleString("fr-FR")} %`;
}
