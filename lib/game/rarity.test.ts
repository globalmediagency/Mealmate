import { describe, expect, it } from "vitest";
import { speciesByRarity, speciesForTier } from "@/lib/creatures";
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
  it("picks uniformly inside the drawn rarity", () => {
    const groups = speciesByRarity("facile");
    const first = drawSpecies("facile", sequence([0, 0]), groups);
    const last = drawSpecies("facile", sequence([0, 0.999]), groups);
    expect(first.rarity).toBe("commun");
    expect(last.rarity).toBe("commun");
    expect(first.id).toBe(groups.commun[0].id);
    expect(last.id).toBe(groups.commun[groups.commun.length - 1].id);
  });

  it("returns the legendary on a top roll", () => {
    const species = drawSpecies("facile", sequence([0.99, 0.5]));
    expect(species.rarity).toBe("legendaire");
  });

  it("falls back to a lower rarity when the drawn one has no species yet", () => {
    const groups = speciesByRarity("facile");
    const partial = { ...groups, legendaire: [], tres_rare: [] };
    const species = drawSpecies("facile", sequence([0.99, 0.2]), partial);
    expect(species.rarity).toBe("rare");
  });

  it("throws when the tier has no species at all", () => {
    expect(() =>
      drawSpecies("moyen", sequence([0, 0]), { commun: [], rare: [], tres_rare: [], legendaire: [] }),
    ).toThrow();
  });
});

describe("speciesProbability", () => {
  it("sums to one across a tier", () => {
    const total = speciesForTier("facile").reduce((sum, s) => sum + speciesProbability(s), 0);
    expect(total).toBeCloseTo(1, 10);
  });
});
