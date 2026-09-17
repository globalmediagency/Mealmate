import { describe, expect, it } from "vitest";
import { COLLECTIONS, RARITIES, SPECIES_PER_RARITY, SPECIES_PER_TIER, TIERS, type Rarity, type Tier } from "@/lib/game/config";
import { ALL_SPECIES, speciesForTier, speciesOfCollection } from "./index";
import { parsePixelArt } from "./pixel";

/** The base roster of a tier, without the themed collections. */
const baseOf = (tier: Tier) => speciesForTier(tier).filter((s) => !s.collection);
const byRarity = (list: { rarity: Rarity }[]) => Object.fromEntries(RARITIES.map((r) => [r, list.filter((s) => s.rarity === r).length])) as Record<Rarity, number>;

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

  it("never exceeds the per-rarity quota of a tier's base roster", () => {
    for (const tier of TIERS) {
      const groups = byRarity(baseOf(tier));
      for (const rarity of RARITIES) {
        expect(groups[rarity]).toBeLessThanOrEqual(SPECIES_PER_RARITY[rarity]);
      }
      expect(baseOf(tier).length).toBeLessThanOrEqual(SPECIES_PER_TIER);
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

  it("ships the full roster: 20 species per tier with exact quotas", () => {
    for (const tier of TIERS) {
      expect(baseOf(tier).length).toBe(SPECIES_PER_TIER);
      const groups = byRarity(baseOf(tier));
      for (const rarity of RARITIES) expect(groups[rarity]).toBe(SPECIES_PER_RARITY[rarity]);
    }
    expect(ALL_SPECIES.length).toBe(60 + 12);
  });

  it("ships the Zodiaque collection: twelve pixel-art species of tier moyen with their own quotas", () => {
    const zodiac = speciesOfCollection("zodiaque");
    expect(zodiac.map((s) => s.name).sort((a, b) => a.localeCompare(b, "fr"))).toEqual(["Buffle", "Cheval", "Chèvre", "Chien", "Cochon", "Coq", "Dragon", "Lapin", "Rat", "Serpent", "Singe", "Tigre"]);
    const groups = byRarity(zodiac);
    for (const rarity of RARITIES) expect(groups[rarity]).toBe(COLLECTIONS.zodiaque.perRarity[rarity]);
    for (const species of zodiac) {
      expect(species.tier).toBe(COLLECTIONS.zodiaque.tier);
      expect(species.id.startsWith("moyen-zodiaque-")).toBe(true);
      expect(species.pixel).toBeDefined();
      // Every grid parses (28 × 28, known characters, eyes present) and its anchors fall inside the viewBox.
      const sprite = parsePixelArt(species.pixel!);
      expect(sprite.eyes.length).toBeGreaterThanOrEqual(1);
      for (const [x, y] of Object.values(sprite.anchors)) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(100);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(100);
      }
    }
    // The collection is drawn in the same tier's eggs, after the base roster.
    const moyen = speciesForTier("moyen");
    expect(moyen.length).toBe(SPECIES_PER_TIER + zodiac.length);
    expect(moyen.slice(SPECIES_PER_TIER).every((s) => s.collection === "zodiaque")).toBe(true);
  });
});
