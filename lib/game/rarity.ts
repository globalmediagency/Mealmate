import { randomInt } from "node:crypto";
import { speciesByRarity } from "@/lib/creatures";
import type { Species } from "@/lib/creatures/types";
import { RARITIES, RARITY_WEIGHTS, type Rarity, type Tier } from "./config";

/** Uniform random in [0, 1) backed by `crypto.randomInt`. */
export function secureRandom(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

/** Draws a rarity according to `RARITY_WEIGHTS` (weights sum to 1). */
export function drawRarity(random: () => number = secureRandom): Rarity {
  const roll = random();
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += RARITY_WEIGHTS[rarity];
    if (roll < cumulative) return rarity;
  }
  return RARITIES[RARITIES.length - 1];
}

/**
 * Draws a species of the tier: first the rarity, then uniformly among the
 * species of that rarity. If the tier has no species of the drawn rarity yet,
 * falls back to the closest lower rarity that has some.
 */
export function drawSpecies(
  tier: Tier,
  random: () => number = secureRandom,
  groups: Record<Rarity, Species[]> = speciesByRarity(tier),
): Species {
  const rarity = drawRarity(random);
  const order = RARITIES.slice(0, RARITIES.indexOf(rarity) + 1).reverse();
  const pool = order.map((r) => groups[r]).find((list) => list.length > 0) ??
    RARITIES.map((r) => groups[r]).find((list) => list.length > 0);
  if (!pool || pool.length === 0) {
    throw new Error(`No species available for tier "${tier}".`);
  }
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

/** Probability of hatching a given species (rarity weight ÷ species of that rarity). */
export function speciesProbability(species: Species, groups = speciesByRarity(species.tier)): number {
  const count = groups[species.rarity].length;
  return count === 0 ? 0 : RARITY_WEIGHTS[species.rarity] / count;
}
