import { describe, expect, it } from "vitest";
import { RARITIES, SPECIES_PER_RARITY, SPECIES_PER_TIER, TIERS } from "@/lib/game/config";
import { ALL_SPECIES, speciesByRarity, speciesForTier } from "./index";

describe("species registry", () => {
  it("has unique ids prefixed with their tier", () => {
    const ids = ALL_SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const species of ALL_SPECIES) {
      expect(species.id.startsWith(`${species.tier}-`)).toBe(true);
    }
  });

  it("has unique display names", () => {
    const names = ALL_SPECIES.map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("never exceeds the per-rarity quota of a tier", () => {
    for (const tier of TIERS) {
      const groups = speciesByRarity(tier);
      for (const rarity of RARITIES) {
        expect(groups[rarity].length).toBeLessThanOrEqual(SPECIES_PER_RARITY[rarity]);
      }
      expect(speciesForTier(tier).length).toBeLessThanOrEqual(SPECIES_PER_TIER);
    }
  });

  it("reserves extras to very rare and legendary species", () => {
    for (const species of ALL_SPECIES) {
      const hasExtra =
        species.parts.extra !== null &&
        (Array.isArray(species.parts.extra) ? species.parts.extra.length > 0 : true);
      if (hasExtra) {
        expect(["tres_rare", "legendaire"]).toContain(species.rarity);
      }
    }
  });

  it("ships at least 10 species per tier with exactly one legendary", () => {
    for (const tier of TIERS) {
      expect(speciesForTier(tier).length).toBeGreaterThanOrEqual(10);
      expect(speciesByRarity(tier).legendaire).toHaveLength(1);
    }
  });
});
