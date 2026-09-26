import { describe, expect, it } from "vitest";
import { hasBackdropRenderer } from "@/components/backdrops";
import { BACKDROPS, BACKDROP_IDS, CHEST_BACKDROPS, THEME_BACKDROPS, backdropForTheme, backdropsByRarity, isBackdropId, missingChestBackdrops, resolveBackdrop } from "@/lib/backdrops/catalog";
import { THEME_IDS } from "@/lib/themes/catalog";
import { backdropWeight, drawBackdrop, drawChestBackdrop } from "./backdrops";
import { BACKDROP_DROPS } from "./config";

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("backdrop catalog", () => {
  it("has one scene per design plus ten chest scenes, all unique", () => {
    expect(new Set(BACKDROP_IDS).size).toBe(BACKDROP_IDS.length);
    expect(BACKDROPS.map((b) => b.id)).toEqual([...BACKDROP_IDS]);
    expect(THEME_BACKDROPS.map((b) => b.theme)).toEqual([...THEME_IDS]);
    expect(CHEST_BACKDROPS).toHaveLength(10);
    for (const b of CHEST_BACKDROPS) expect(b.theme).toBeUndefined();
    const groups = backdropsByRarity();
    expect(groups.commun.length).toBeGreaterThan(0);
    expect(groups.rare.length).toBeGreaterThan(0);
    expect(groups.tres_rare.length).toBeGreaterThan(0);
    expect(groups.legendaire).toHaveLength(1);
  });

  it("every backdrop has a drawing", () => {
    for (const b of BACKDROPS) expect(hasBackdropRenderer(b.id), b.id).toBe(true);
  });

  it("resolves a creature's pick, else the design's own scene", () => {
    expect(resolveBackdrop(null, "sable").id).toBe("sable");
    expect(resolveBackdrop("nope", "plage").id).toBe("plage");
    expect(resolveBackdrop("galaxie", "foret").id).toBe("galaxie");
    for (const theme of THEME_IDS) expect(backdropForTheme(theme).theme).toBe(theme);
    expect(isBackdropId("aurore")).toBe(true);
    expect(isBackdropId("")).toBe(false);
  });
});

describe("drawBackdrop", () => {
  it("never draws a backdrop already owned and stops when none is missing", () => {
    const owned = new Set(CHEST_BACKDROPS.slice(0, 9).map((b) => b.id));
    const last = CHEST_BACKDROPS[9];
    for (const roll of [0, 0.3, 0.99]) expect(drawBackdrop(owned, () => roll)?.id).toBe(last.id);
    expect(drawBackdrop(new Set(CHEST_BACKDROPS.map((b) => b.id)), () => 0.5)).toBeNull();
    expect(missingChestBackdrops(owned)).toEqual([last]);
  });

  it("weights rarities like accessories (65 / 25 / 8 / 2 split within each rarity)", () => {
    const groups = backdropsByRarity();
    expect(groups.commun.reduce((sum, b) => sum + backdropWeight(b), 0)).toBeCloseTo(65, 6);
    expect(groups.legendaire.reduce((sum, b) => sum + backdropWeight(b), 0)).toBeCloseTo(2, 6);
    // A low roll lands in the common block, a roll near 1 on the legendary one.
    expect(drawBackdrop(new Set(), () => 0.01)?.rarity).toBe("commun");
    expect(drawBackdrop(new Set(), () => 0.999)?.rarity).toBe("legendaire");
  });

  it("gives a backdrop with the chest chance only, and never once the set is complete", () => {
    const chance = BACKDROP_DROPS.chestChance;
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThan(1);
    expect(drawChestBackdrop(new Set(), sequence([chance, 0.5]))).toBeNull();
    expect(drawChestBackdrop(new Set(), sequence([chance - 0.001, 0.5]))).not.toBeNull();
    expect(drawChestBackdrop(new Set(CHEST_BACKDROPS.map((b) => b.id)), () => 0)).toBeNull();
  });
});
