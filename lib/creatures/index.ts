import { RARITIES, TIERS, type CollectionId, type Rarity, type Tier } from "@/lib/game/config";
import { DIFFICILE_SPECIES } from "./species/difficile";
import { FACILE_SPECIES } from "./species/facile";
import { MOYEN_SPECIES } from "./species/moyen";
import { ZODIAQUE_SPECIES } from "./species/zodiaque";
import type { Species } from "./types";

export type { Species, SpeciesSummary } from "./types";
export { toSpeciesSummary } from "./types";

/** Every species: 20 per tier, plus the Zodiaque collection (12, tier "moyen", pixel art). */
export const ALL_SPECIES: readonly Species[] = [...FACILE_SPECIES, ...MOYEN_SPECIES, ...DIFFICILE_SPECIES, ...ZODIAQUE_SPECIES];

const BY_ID = new Map(ALL_SPECIES.map((species) => [species.id, species]));

export function getSpecies(id: string): Species | undefined {
  return BY_ID.get(id);
}

/** Species of a tier (collections after the base roster), commons first and the legendary last (stable by name within a rarity). */
export function speciesForTier(tier: Tier): Species[] {
  return ALL_SPECIES.filter((species) => species.tier === tier).sort(
    (a, b) => Number(Boolean(a.collection)) - Number(Boolean(b.collection)) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name, "fr"),
  );
}

/** The species of a themed collection, commons first. */
export function speciesOfCollection(collection: CollectionId): Species[] {
  return ALL_SPECIES.filter((species) => species.collection === collection).sort(
    (a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name, "fr"),
  );
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
