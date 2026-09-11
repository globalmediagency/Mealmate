import { describe, expect, it } from "vitest";
import { ACCESSORIES, accessoriesByRarity } from "@/lib/accessories/catalog";
import { speciesForTier } from "@/lib/creatures";
import { ACCESSORY_RARITY_WEIGHTS, RARITIES, RARITY_WEIGHTS, TIERS } from "./config";
import { accessoryWeights, compactOverrides, defaultSpeciesWeight, dropWeightsSchema, effectiveWeights, formatChance, isAllZero, PER_MILLE, pickWeighted, speciesWeights } from "./drops";

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("default weights", () => {
  it("sum to 1000 ‰ per tier and reproduce the rarity shares", () => {
    for (const tier of TIERS) {
      const rows = speciesWeights(tier);
      expect(rows).toHaveLength(speciesForTier(tier).length);
      expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(PER_MILLE, 0);
      for (const rarity of RARITIES) {
        const share = rows.filter((r) => r.item.rarity === rarity).reduce((s, r) => s + r.perMille, 0);
        expect(share).toBeCloseTo(RARITY_WEIGHTS[rarity] * PER_MILLE, 0);
      }
      expect(rows.every((r) => !r.overridden)).toBe(true);
    }
  });

  it("do the same for accessories, commons first", () => {
    const rows = accessoryWeights();
    expect(rows).toHaveLength(ACCESSORIES.length);
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(PER_MILLE, 0);
    for (const rarity of RARITIES) {
      const share = rows.filter((r) => r.item.rarity === rarity).reduce((s, r) => s + r.perMille, 0);
      expect(share).toBeCloseTo(ACCESSORY_RARITY_WEIGHTS[rarity] * PER_MILLE, 0);
    }
    expect(rows[0].item.id).toBe(accessoriesByRarity().commun[0].id);
    expect(rows[rows.length - 1].item.rarity).toBe("legendaire");
  });

  it("express a common easy species as roughly 1 chance in 15", () => {
    const common = speciesWeights("facile").find((r) => r.item.rarity === "commun")!;
    expect(common.oneIn).toBe(15);
    expect(formatChance(common)).toBe("66,7 ‰ · 1 chance sur 15");
    const legendary = speciesWeights("facile").find((r) => r.item.rarity === "legendaire")!;
    expect(legendary.oneIn).toBe(50);
  });
});

describe("overrides", () => {
  it("renormalise the pool and can remove an item", () => {
    const [first, ...rest] = speciesForTier("facile");
    const rows = speciesWeights("facile", { [first.id]: 0, [rest[0].id]: 500 });
    const removed = rows.find((r) => r.item.id === first.id)!;
    expect(removed.weight).toBe(0);
    expect(removed.oneIn).toBeNull();
    expect(formatChance(removed)).toBe("jamais (0 ‰)");
    const boosted = rows.find((r) => r.item.id === rest[0].id)!;
    expect(boosted.overridden).toBe(true);
    expect(rows.reduce((s, r) => s + r.perMille, 0)).toBeCloseTo(PER_MILLE, 0);
    expect(boosted.perMille).toBeGreaterThan(300);
  });

  it("compactOverrides keeps only real changes", () => {
    const [first, second] = speciesForTier("facile");
    const rows = speciesWeights("facile", { [first.id]: defaultSpeciesWeight(first), [second.id]: 10 });
    const compact = compactOverrides(rows, (s) => s.id);
    expect(compact).toEqual({ [second.id]: 10 });
  });

  it("an all-zero pool displays and draws the rarity defaults", () => {
    const pool = speciesForTier("facile");
    const zero = Object.fromEntries(pool.map((s) => [s.id, 0]));
    const rows = speciesWeights("facile", zero);
    expect(isAllZero(rows)).toBe(true);
    expect(isAllZero(speciesWeights("facile"))).toBe(false);
    for (const row of rows) expect(row.perMille).toBeCloseTo(row.defaultWeight, 6);
    expect(rows.find((r) => r.item.rarity === "commun")!.oneIn).toBe(15);
    expect(pickWeighted(rows, sequence([0])).rarity).toBe("commun");
    expect(pickWeighted(rows, sequence([0.999])).rarity).toBe("legendaire");
  });

  it("stores weights quantised to 0.01 ‰", () => {
    const parsed = dropWeightsSchema.parse({ species: { a: 12.345, b: "7,5".replace(",", ".") }, accessories: { c: 1e-9 } });
    expect(parsed).toEqual({ species: { a: 12.35, b: 7.5 }, accessories: { c: 0 } });
    expect(() => dropWeightsSchema.parse({ species: { a: 1000.001 } })).toThrow();
  });
});

describe("pickWeighted", () => {
  const rows = [
    { item: "a", weight: 600 },
    { item: "b", weight: 0 },
    { item: "c", weight: 400 },
  ];

  it("walks the cumulative weights and skips zero-weight items", () => {
    expect(pickWeighted(rows, sequence([0]))).toBe("a");
    expect(pickWeighted(rows, sequence([0.599]))).toBe("a");
    expect(pickWeighted(rows, sequence([0.6]))).toBe("c");
    expect(pickWeighted(rows, sequence([0.999999]))).toBe("c");
    const draws = new Set<string>();
    for (let i = 0; i < 200; i += 1) draws.add(pickWeighted(rows, sequence([i / 200])));
    expect(draws.has("b")).toBe(false);
  });

  it("falls back to the defaults, then to a uniform pick, when every weight is zero", () => {
    const zero = rows.map((r) => ({ ...r, weight: 0 }));
    expect(effectiveWeights(zero)).toEqual([1, 1, 1]);
    expect(pickWeighted(zero, sequence([0]))).toBe("a");
    expect(pickWeighted(zero, sequence([0.5]))).toBe("b");
    expect(pickWeighted(zero, sequence([0.99]))).toBe("c");
    const withDefaults = zero.map((r, i) => ({ ...r, defaultWeight: [100, 0, 900][i] }));
    expect(effectiveWeights(withDefaults)).toEqual([100, 0, 900]);
    expect(pickWeighted(withDefaults, sequence([0.05]))).toBe("a");
    expect(pickWeighted(withDefaults, sequence([0.5]))).toBe("c");
  });
});
