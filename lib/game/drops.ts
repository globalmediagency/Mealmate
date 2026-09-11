import { z } from "zod";
import { ACCESSORIES, type Accessory } from "@/lib/accessories/catalog";
import { speciesForTier } from "@/lib/creatures";
import type { Species } from "@/lib/creatures/types";
import { ACCESSORY_RARITY_WEIGHTS, RARITIES, RARITY_WEIGHTS, TIERS, type Tier } from "./config";

/** Weights are expressed as a percentage of the pool: 100 % = the whole pool. */
export const PERCENT = 100;

/** Stored precision: three decimals of a percent (0.001 %), well above the RNG resolution (1e-9). */
export const WEIGHT_DECIMALS = 3;
const WEIGHT_STEP = 10 ** WEIGHT_DECIMALS;
export const quantizeWeight = (n: number) => Math.round(n * WEIGHT_STEP) / WEIGHT_STEP;

/** One stored weight: 0..100 %, quantised to 0.001 %. */
export const weightEntrySchema = z.coerce.number().min(0).max(PERCENT).transform(quantizeWeight);
const weightMap = z.record(z.string(), weightEntrySchema);

/** Admin overrides: item id → weight in %. Anything absent uses the rarity-based default. */
export const dropWeightsSchema = z.object({
  species: weightMap.default({}),
  accessories: weightMap.default({}),
});
export type DropWeights = z.infer<typeof dropWeightsSchema>;
export const EMPTY_DROP_WEIGHTS: DropWeights = { species: {}, accessories: {} };

/** "6,667 %" — up to three decimals, trailing zeros dropped. */
export function formatPercent(n: number): string {
  return `${quantizeWeight(n).toLocaleString("fr-FR", { maximumFractionDigits: WEIGHT_DECIMALS })} %`;
}

function shareOfRarity(rarityWeight: number, count: number): number {
  // Exact share (no rounding) so a pool's defaults sum to exactly 100 %; display rounds.
  return count === 0 ? 0 : (rarityWeight * PERCENT) / count;
}

/** Default weight of a species: its rarity's share of the tier, split evenly inside the rarity. */
export function defaultSpeciesWeight(species: Species, pool: readonly Species[] = speciesForTier(species.tier)): number {
  return shareOfRarity(RARITY_WEIGHTS[species.rarity], pool.filter((s) => s.rarity === species.rarity).length);
}

/** Default weight of an accessory: its rarity's share of the catalogue, split evenly inside the rarity. */
export function defaultAccessoryWeight(accessory: Accessory, pool: readonly Accessory[] = ACCESSORIES): number {
  return shareOfRarity(ACCESSORY_RARITY_WEIGHTS[accessory.rarity], pool.filter((a) => a.rarity === accessory.rarity).length);
}

export type Weighted<T> = {
  item: T;
  /** Weight in % actually used by the draw. */
  weight: number;
  defaultWeight: number;
  overridden: boolean;
  /** Effective chance once the pool is normalised (% of the pool). */
  percent: number;
  /** "1 chance sur N", null when the weight is zero. */
  oneIn: number | null;
};

type PoolRow = { weight: number; defaultWeight?: number };

const positiveSum = (values: number[]) => values.reduce((sum, v) => sum + Math.max(0, v), 0);

/**
 * Weights the draw really uses. An all-zero pool (every override at 0) falls
 * back to the rarity defaults, then to a uniform pick, so a bad override never
 * breaks hatching or chests — and the admin pages display the same fallback.
 */
export function effectiveWeights(rows: ReadonlyArray<PoolRow>): number[] {
  const weights = rows.map((row) => Math.max(0, row.weight));
  if (positiveSum(weights) > 0) return weights;
  const defaults = rows.map((row) => Math.max(0, row.defaultWeight ?? 0));
  if (positiveSum(defaults) > 0) return defaults;
  return rows.map(() => 1);
}

/** True when every weight of the pool is 0 (the draw then falls back to the defaults). */
export function isAllZero(rows: ReadonlyArray<PoolRow>): boolean {
  return rows.length > 0 && positiveSum(rows.map((row) => row.weight)) <= 0;
}

function withChances<T>(rows: Array<Pick<Weighted<T>, "item" | "weight" | "defaultWeight" | "overridden">>): Weighted<T>[] {
  const used = effectiveWeights(rows);
  const total = positiveSum(used);
  return rows.map((row, i) => ({
    ...row,
    percent: total > 0 ? (used[i] / total) * PERCENT : 0,
    oneIn: used[i] > 0 ? Math.max(1, Math.round(total / used[i])) : null,
  }));
}

/** Species of a tier with their weights, commons first (the draw order). */
export function speciesWeights(tier: Tier, overrides: Record<string, number> = {}): Weighted<Species>[] {
  const pool = speciesForTier(tier);
  return withChances(
    pool.map((species) => {
      const defaultWeight = defaultSpeciesWeight(species, pool);
      const override = overrides[species.id];
      return { item: species, defaultWeight, weight: override ?? defaultWeight, overridden: override !== undefined };
    }),
  );
}

/** Every accessory with its weight, commons first then catalogue order. */
export function accessoryWeights(overrides: Record<string, number> = {}): Weighted<Accessory>[] {
  const pool = [...ACCESSORIES].sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
  return withChances(
    pool.map((accessory) => {
      const defaultWeight = defaultAccessoryWeight(accessory);
      const override = overrides[accessory.id];
      return { item: accessory, defaultWeight, weight: override ?? defaultWeight, overridden: override !== undefined };
    }),
  );
}

/**
 * Weighted pick: the roll walks the cumulative weights (see `effectiveWeights`
 * for the all-zero fallback, shared with the admin display).
 */
export function pickWeighted<T>(rows: ReadonlyArray<{ item: T } & PoolRow>, random: () => number): T {
  if (rows.length === 0) throw new Error("Empty pool.");
  const weights = effectiveWeights(rows);
  const total = positiveSum(weights);
  const roll = Math.min(0.999_999_999, Math.max(0, random()));
  const target = roll * total;
  // Tiny epsilon so an exact boundary roll (0.6 on a 60 % block) is not swallowed by float noise.
  const epsilon = 1e-9;
  let cumulative = 0;
  let last: T | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (weights[i] <= 0) continue;
    cumulative += weights[i];
    last = rows[i].item;
    if (target < cumulative - epsilon) return rows[i].item;
  }
  return last ?? rows[rows.length - 1].item;
}

/** "6,667 % · 1 chance sur 15" for the admin pages. */
export function formatChance(row: Pick<Weighted<unknown>, "percent" | "oneIn">): string {
  if (row.oneIn === null || row.percent <= 0) return "jamais (0 %)";
  return `${formatPercent(row.percent)} · 1 chance sur ${row.oneIn.toLocaleString("fr-FR")}`;
}

/** Strips overrides equal to the default so the stored document only holds real changes. */
export function compactOverrides<T>(rows: ReadonlyArray<Weighted<T>>, idOf: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) if (row.overridden && quantizeWeight(row.weight) !== quantizeWeight(row.defaultWeight)) out[idOf(row.item)] = quantizeWeight(row.weight);
  return out;
}

/** Default weight of every known item (species of all tiers + accessories), by id. */
export function defaultWeightsById(): { species: Map<string, number>; accessories: Map<string, number> } {
  const species = new Map<string, number>();
  for (const tier of TIERS) for (const row of speciesWeights(tier)) species.set(row.item.id, row.defaultWeight);
  const accessories = new Map<string, number>();
  for (const row of accessoryWeights()) accessories.set(row.item.id, row.defaultWeight);
  return { species, accessories };
}
