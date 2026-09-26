import type { CreatureView, MoodEffects } from "./creature-view";
import { formatSignedPercent, MOOD_BAND_LABELS, type MoodBand } from "./mood";
import { HUNGER_ALERT_THRESHOLD } from "./config";
import { gameDate } from "./time";

const CHEERFUL_LINES = [
  "Trop bien cette balade !",
  "Qu'est-ce qu'on mange aujourd'hui ?",
  "Je me sens en pleine forme !",
  "On sort marcher un peu ?",
  "Tu m'as manqué !",
  "Raconte-moi ta journée.",
];

function pick<T>(items: readonly T[], seed: string): T {
  let h = 0;
  for (const char of seed) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return items[h % items.length];
}

/** Contextual speech-bubble line, in the creature's voice (spec § 4.5). */
export function creatureLine(creature: CreatureView, today = gameDate()): string {
  if (creature.state === "dead") return "…";
  if (creature.health < 30) return "Je ne me sens pas bien…";
  if (creature.hunger >= 80) return "J'ai trop faim…";
  if (creature.hunger >= HUNGER_ALERT_THRESHOLD) return "J'ai faim…";
  if (creature.health < 60) return "Je suis un peu fatigué·e…";
  if (creature.moodBand === "gloomy") return "J'ai le cœur lourd… tu viens jouer ?";
  if (creature.mood < 40) return "On joue ? Je m'ennuie.";
  if (creature.ageDays === 0) return "Coucou ! C'est toi qui m'as fait éclore ?";
  const lines = creature.species ? [...CHEERFUL_LINES, creature.species.tagline] : CHEERFUL_LINES;
  return pick(lines, `${creature.id}-${today}`);
}

/** Human label for the hunger gauge (0 = full, 100 = starving). */
export function hungerLabel(hunger: number): string {
  if (hunger < 15) return "Repue";
  if (hunger < HUNGER_ALERT_THRESHOLD) return "Ça va";
  if (hunger < 80) return "A faim";
  return "Affamée";
}

/** Caption of the mood gauge: band + the effect in force (spec § 3.18). */
export function moodLabel(band: MoodBand, effects: MoodEffects): string {
  const name = MOOD_BAND_LABELS[band];
  if (band === "gloomy" && effects.healthLossPerHour > 0) return `${name} · santé ${formatSignedPercent(-effects.gloomyHealthLossPerHour).replace(" %", " pt/h")}`;
  if (effects.xpPercent !== 0) return `${name} · XP ${formatSignedPercent(effects.xpPercent)}`;
  return name;
}

/** One-sentence reminder of the mood rules, shown under the gauges. */
export function moodHelp(effects: MoodEffects): string {
  const parts: string[] = [];
  if (effects.xpBonusPercent > 0 || effects.chestStepsBonusPercent > 0) {
    const gains = [
      effects.xpBonusPercent > 0 ? `${formatSignedPercent(effects.xpBonusPercent)} d'XP` : null,
      effects.chestStepsBonusPercent > 0 ? `${formatSignedPercent(effects.chestStepsBonusPercent)} de pas pour les coffres` : null,
    ].filter(Boolean);
    parts.push(`Humeur à partir de ${effects.happyMin} : ${gains.join(" et ")}.`);
  }
  if (effects.xpMalusPercent > 0) parts.push(`Sous ${effects.lowMax} : ${formatSignedPercent(-effects.xpMalusPercent)} d'XP.`);
  if (effects.gloomyHealthLossPerHour > 0) parts.push(`Sous ${effects.gloomyMax} : elle perd ${effects.gloomyHealthLossPerHour.toLocaleString("fr-FR")} pt de santé par heure.`);
  return parts.join(" ");
}

export function ageLabel(ageDays: number): string {
  if (ageDays <= 0) return "Né·e aujourd'hui";
  if (ageDays === 1) return "1 jour";
  return `${ageDays} jours`;
}

/** The one sentence about the shared daily play limit (every game counts in it). */
export function playLimitLabel(maxPerDay: number): string {
  return `${maxPerDay} partie${maxPerDay > 1 ? "s" : ""} par jour au total, tous jeux confondus.`;
}

/** "n parties restantes aujourd'hui" (or "à demain") for the games hub, the tiles and the game screens. */
export function playsLeftLabel(left: number): string {
  if (left <= 0) return "Plus de partie aujourd'hui · à demain !";
  return `${left} partie${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""} aujourd'hui`;
}

export type CareAction = "feed" | "heal" | null;

/**
 * The care the creature needs right now, used by the home screen to highlight
 * one tile (and by the care alert to say why): a sick or tired creature with a
 * dose in the cupboard → heal; hungry, or sick without any dose → feed (healthy
 * meals heal for free); otherwise nothing special.
 */
export function careAction(creature: Pick<CreatureView, "status" | "state" | "hunger">, doses: number): CareAction {
  if (creature.status !== "alive") return null;
  if ((creature.state === "sick" || creature.state === "tired") && doses > 0) return "heal";
  if (creature.state === "sick") return "feed";
  if (creature.hunger >= HUNGER_ALERT_THRESHOLD) return "feed";
  return null;
}
