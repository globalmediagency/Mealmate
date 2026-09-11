import { CHEST_ACCESSORIES, type Accessory } from "@/lib/accessories/catalog";
import { ACCESSORY_RARITY_WEIGHTS, RARITIES, STEPS, type Rarity } from "./config";
import { accessoryWeights, pickWeighted } from "./drops";
import { secureRandom } from "./rarity";

/** Draws an accessory rarity (65 / 25 / 8 / 2 %). Kept for simulations. */
export function drawAccessoryRarity(random: () => number = secureRandom): Rarity {
  const roll = random();
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += ACCESSORY_RARITY_WEIGHTS[rarity];
    if (roll < cumulative) return rarity;
  }
  return RARITIES[RARITIES.length - 1];
}

export type AccessoryDraw = { accessory: Accessory; duplicate: boolean };

/**
 * Draws an accessory with one weighted roll over a pool (step chests by
 * default; a coaching reward pool otherwise). Defaults = rarity shares split
 * evenly, overrides from /admin. A duplicate is a new copy: copies can be
 * traded or given away.
 */
export function drawAccessory(
  ownedIds: ReadonlySet<string>,
  random: () => number = secureRandom,
  overrides: Record<string, number> = {},
  pool: readonly Accessory[] = CHEST_ACCESSORIES,
): AccessoryDraw {
  const accessory = pickWeighted(accessoryWeights(overrides, pool), random);
  return { accessory, duplicate: ownedIds.has(accessory.id) };
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
