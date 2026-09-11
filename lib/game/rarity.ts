import { randomInt } from "node:crypto";
import type { Species } from "@/lib/creatures/types";
import { RARITIES, RARITY_WEIGHTS, type Rarity, type Tier } from "./config";
import { PERCENT, pickWeighted, speciesWeights } from "./drops";

/** Uniform random in [0, 1) backed by `crypto.randomInt` (1e-9 resolution: the smallest storable weight, 0.001 %, spans 10 000 roll values). */
export function secureRandom(): number {
  return randomInt(0, 1_000_000_000) / 1_000_000_000;
}

/** Draws a rarity according to `RARITY_WEIGHTS` (weights sum to 1). Kept for simulations. */
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
 * Draws a species of the tier with one weighted roll over the whole tier
 * (default weights = the rarity shares split evenly, overrides from /admin).
 */
export function drawSpecies(tier: Tier, random: () => number = secureRandom, overrides: Record<string, number> = {}): Species {
  const rows = speciesWeights(tier, overrides);
  if (rows.length === 0) throw new Error(`No species available for tier "${tier}".`);
  return pickWeighted(rows, random);
}

/** Probability (0–1) of hatching a given species under the current weights. */
export function speciesProbability(species: Species, overrides: Record<string, number> = {}): number {
  const row = speciesWeights(species.tier, overrides).find((r) => r.item.id === species.id);
  return row ? row.percent / PERCENT : 0;
}
