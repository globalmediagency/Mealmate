import { CHEST_BACKDROPS, missingChestBackdrops, type Backdrop } from "@/lib/backdrops/catalog";
import { ACCESSORY_RARITY_WEIGHTS, BACKDROP_DROPS } from "./config";
import { pickWeighted } from "./drops";
import { secureRandom } from "./rarity";

/**
 * Weight of a chest backdrop: the share of its rarity (65 / 25 / 8 / 2 %)
 * split evenly between the backdrops of that rarity, so a legendary scene is
 * as rare as a legendary hat.
 */
export function backdropWeight(backdrop: Backdrop, pool: readonly Backdrop[] = CHEST_BACKDROPS): number {
  const siblings = pool.filter((b) => b.rarity === backdrop.rarity).length;
  return siblings === 0 ? 0 : (ACCESSORY_RARITY_WEIGHTS[backdrop.rarity] * 100) / siblings;
}

/** Draws one of the chest backdrops the player is still missing (never a duplicate), or null when they have them all. */
export function drawBackdrop(ownedIds: ReadonlySet<string>, random: () => number = secureRandom): Backdrop | null {
  const missing = missingChestBackdrops(ownedIds);
  if (missing.length === 0) return null;
  return pickWeighted(
    missing.map((b) => ({ item: b, weight: backdropWeight(b) })),
    random,
  );
}

/**
 * What a step chest holds: with `chance` (default `BACKDROP_DROPS.chestChance`)
 * a backdrop the player is missing, otherwise nothing here and the caller
 * draws an accessory. The first roll decides, the second picks the scene.
 */
export function drawChestBackdrop(ownedIds: ReadonlySet<string>, random: () => number = secureRandom, chance: number = BACKDROP_DROPS.chestChance): Backdrop | null {
  if (missingChestBackdrops(ownedIds).length === 0) return null;
  if (random() >= chance) return null;
  return drawBackdrop(ownedIds, random);
}
