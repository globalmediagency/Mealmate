import { RARITIES, TIERS, type Rarity, type Tier } from "@/lib/game/config";
import { DIFFICILE_SPECIES } from "./species/difficile";
import { FACILE_SPECIES } from "./species/facile";
import { MOYEN_SPECIES } from "./species/moyen";
import type { Species } from "./types";

export type { Species, SpeciesSummary } from "./types";
export { toSpeciesSummary } from "./types";

/** Every species, all tiers (10 per tier for now, 20 per tier at phase 5). */
export const ALL_SPECIES: readonly Species[] = [...FACILE_SPECIES, ...MOYEN_SPECIES, ...DIFFICILE_SPECIES];

const BY_ID = new Map(ALL_SPECIES.map((species) => [species.id, species]));

export function getSpecies(id: string): Species | undefined {
  return BY_ID.get(id);
}

export function speciesForTier(tier: Tier): Species[] {
  return ALL_SPECIES.filter((species) => species.tier === tier);
}

export function speciesByRarity(tier: Tier): Record<Rarity, Species[]> {
  const groups = Object.fromEntries(RARITIES.map((r) => [r, [] as Species[]])) as Record<
    Rarity,
    Species[]
  >;
  for (const species of speciesForTier(tier)) groups[species.rarity].push(species);
  return groups;
}

/** Species of every tier, keyed by tier (for the egg choice screen). */
export function speciesByTierAll(): Record<Tier, Species[]> {
  return Object.fromEntries(TIERS.map((tier) => [tier, speciesForTier(tier)])) as Record<Tier, Species[]>;
}

/** A tier can be played once it has at least one species to hatch. */
export function isTierPlayable(tier: Tier): boolean {
  return speciesForTier(tier).length > 0;
}

export function playableTiers(): Tier[] {
  return TIERS.filter(isTierPlayable);
}
