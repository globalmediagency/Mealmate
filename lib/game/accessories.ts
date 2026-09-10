import { ACCESSORIES, accessoriesByRarity, type Accessory } from "@/lib/accessories/catalog";
import { ACCESSORY_RARITY_WEIGHTS, RARITIES, STEPS, type Rarity } from "./config";
import { secureRandom } from "./rarity";

/** Draws an accessory rarity (65 / 25 / 8 / 2 %). */
export function drawAccessoryRarity(random: () => number = secureRandom): Rarity {
  const roll = random();
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += ACCESSORY_RARITY_WEIGHTS[rarity];
    if (roll < cumulative) return rarity;
  }
  return RARITIES[RARITIES.length - 1];
}

export type AccessoryDraw = { accessory: Accessory; duplicate: boolean; xpGain: number };

/**
 * Draws an accessory: rarity first, then uniformly inside the rarity.
 * Duplicates are possible (spec § 3.6) and give XP instead.
 */
export function drawAccessory(ownedIds: ReadonlySet<string>, random: () => number = secureRandom, groups = accessoriesByRarity()): AccessoryDraw {
  const rarity = drawAccessoryRarity(random);
  const pool = groups[rarity].length > 0 ? groups[rarity] : ACCESSORIES;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  const accessory = pool[index];
  const duplicate = ownedIds.has(accessory.id);
  return { accessory, duplicate, xpGain: duplicate ? STEPS.duplicateAccessoryXp : 0 };
}

export type ChestStatus = {
  /** Steps walked since the creature hatched (all sources). */
  totalSteps: number;
  earned: number;
  opened: number;
  /** Chests ready to open. */
  available: number;
  /** Steps still needed for the next chest. */
  stepsToNext: number;
  stepsPerChest: number;
};

/** Chests = one per 5 000 cumulated steps since hatching, minus those already opened. */
export function chestStatus(totalSteps: number, opened: number): ChestStatus {
  const per = STEPS.stepsPerAccessory;
  const steps = Math.max(0, Math.floor(totalSteps));
  const earned = Math.floor(steps / per);
  const safeOpened = Math.max(0, Math.min(opened, earned));
  return {
    totalSteps: steps,
    earned,
    opened: safeOpened,
    available: earned - safeOpened,
    stepsToNext: per - (steps % per),
    stepsPerChest: per,
  };
}
