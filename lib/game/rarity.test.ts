import { describe, expect, it } from "vitest";
import { speciesForTier } from "@/lib/creatures";
import { RARITY_WEIGHTS } from "./config";
import { drawRarity, drawSpecies, speciesProbability } from "./rarity";

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("drawRarity", () => {
  it("maps the roll to the cumulative weights", () => {
    expect(drawRarity(() => 0)).toBe("commun");
    expect(drawRarity(() => 0.599)).toBe("commun");
    expect(drawRarity(() => 0.6)).toBe("rare");
    expect(drawRarity(() => 0.879)).toBe("rare");
    expect(drawRarity(() => 0.88)).toBe("tres_rare");
    expect(drawRarity(() => 0.979)).toBe("tres_rare");
    expect(drawRarity(() => 0.98)).toBe("legendaire");
    expect(drawRarity(() => 0.999999)).toBe("legendaire");
  });

  it("weights sum to one", () => {
    const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("roughly follows the distribution over many draws", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts = { commun: 0, rare: 0, tres_rare: 0, legendaire: 0 };
    const n = 20000;
    for (let i = 0; i < n; i += 1) counts[drawRarity(random)] += 1;
    expect(counts.commun / n).toBeGreaterThan(0.56);
    expect(counts.commun / n).toBeLessThan(0.64);
    expect(counts.legendaire / n).toBeGreaterThan(0.01);
    expect(counts.legendaire / n).toBeLessThan(0.035);
  });
});

describe("drawSpecies", () => {
  it("walks the tier from commons to the legendary with one weighted roll", () => {
    const pool = speciesForTier("facile");
    const first = drawSpecies("facile", sequence([0]));
    expect(first.id).toBe(pool[0].id);
    expect(first.rarity).toBe("commun");
    expect(drawSpecies("facile", sequence([0.599])).rarity).toBe("commun");
    expect(drawSpecies("facile", sequence([0.6])).rarity).toBe("rare");
    expect(drawSpecies("facile", sequence([0.9])).rarity).toBe("tres_rare");
    expect(drawSpecies("facile", sequence([0.99])).rarity).toBe("legendaire");
  });

  it("honours admin overrides (a zero weight never drops, a boosted one dominates)", () => {
    const pool = speciesForTier("facile");
    const legendary = pool.find((s) => s.rarity === "legendaire")!;
    for (const roll of [0.985, 0.999, 0.999999]) {
      expect(drawSpecies("facile", sequence([roll]), { [legendary.id]: 0 }).rarity).not.toBe("legendaire");
    }
    const only = Object.fromEntries(pool.map((s) => [s.id, s.id === legendary.id ? 100 : 0]));
    for (const roll of [0, 0.5, 0.999]) expect(drawSpecies("facile", sequence([roll]), only).id).toBe(legendary.id);
  });

  it("roughly follows the rarity distribution over many draws", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts = { commun: 0, rare: 0, tres_rare: 0, legendaire: 0 };
    const n = 20000;
    for (let i = 0; i < n; i += 1) counts[drawSpecies("moyen", random).rarity] += 1;
    expect(counts.commun / n).toBeGreaterThan(0.56);
    expect(counts.commun / n).toBeLessThan(0.64);
    expect(counts.legendaire / n).toBeGreaterThan(0.01);
    expect(counts.legendaire / n).toBeLessThan(0.035);
  });
});

describe("speciesProbability", () => {
  it("sums to one over a tier and reflects overrides", () => {
    const pool = speciesForTier("facile");
    const total = pool.reduce((sum, species) => sum + speciesProbability(species), 0);
    expect(total).toBeCloseTo(1, 5);
    expect(speciesProbability(pool[0], { [pool[0].id]: 0 })).toBe(0);
  });
});
