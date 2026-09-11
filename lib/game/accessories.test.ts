import { describe, expect, it } from "vitest";
import { ACCESSORIES, SLOTS, accessoriesByRarity } from "@/lib/accessories/catalog";
import { hasRenderer } from "@/components/accessories";
import { ACCESSORY_RARITY_WEIGHTS } from "./config";
import { chestStatus, drawAccessory, drawAccessoryRarity } from "./accessories";

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("accessory catalog", () => {
  it("has ~30 unique accessories covering every slot and rarity", () => {
    const ids = ACCESSORIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(30);
    for (const slot of SLOTS) expect(ACCESSORIES.some((a) => a.slot === slot)).toBe(true);
    const groups = accessoriesByRarity();
    expect(groups.commun.length).toBeGreaterThan(0);
    expect(groups.rare.length).toBeGreaterThan(0);
    expect(groups.tres_rare.length).toBeGreaterThan(0);
    expect(groups.legendaire.length).toBeGreaterThan(0);
  });

  it("every accessory has an SVG renderer", () => {
    for (const accessory of ACCESSORIES) expect(hasRenderer(accessory.id), accessory.id).toBe(true);
  });

  it("weights sum to one", () => {
    expect(Object.values(ACCESSORY_RARITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe("drawAccessoryRarity", () => {
  it("maps rolls to the 65 / 25 / 8 / 2 bands", () => {
    expect(drawAccessoryRarity(() => 0.1)).toBe("commun");
    expect(drawAccessoryRarity(() => 0.649)).toBe("commun");
    expect(drawAccessoryRarity(() => 0.65)).toBe("rare");
    expect(drawAccessoryRarity(() => 0.9)).toBe("tres_rare");
    expect(drawAccessoryRarity(() => 0.985)).toBe("legendaire");
  });
});

describe("drawAccessory", () => {
  it("walks the catalogue with one weighted roll and flags copies", () => {
    const groups = accessoriesByRarity();
    const first = drawAccessory(new Set(), sequence([0]));
    expect(first.accessory.id).toBe(groups.commun[0].id);
    expect(first.duplicate).toBe(false);
    const again = drawAccessory(new Set([groups.commun[0].id]), sequence([0]));
    expect(again.duplicate).toBe(true);
    expect(drawAccessory(new Set(), sequence([0.649])).accessory.rarity).toBe("commun");
    expect(drawAccessory(new Set(), sequence([0.65])).accessory.rarity).toBe("rare");
    expect(drawAccessory(new Set(), sequence([0.99])).accessory.rarity).toBe("legendaire");
  });

  it("honours admin overrides", () => {
    const groups = accessoriesByRarity();
    const halo = groups.legendaire[0];
    expect(drawAccessory(new Set(), sequence([0.999]), { [halo.id]: 0 }).accessory.id).not.toBe(halo.id);
    const only = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a.id === halo.id ? 1000 : 0]));
    expect(drawAccessory(new Set(), sequence([0.2]), only).accessory.id).toBe(halo.id);
  });
});

describe("chestStatus", () => {
  it("counts one chest per 5 000 steps", () => {
    expect(chestStatus(12_300, 0)).toMatchObject({ earned: 2, opened: 0, available: 2, stepsToNext: 2_700 });
    expect(chestStatus(12_300, 2)).toMatchObject({ available: 0 });
    expect(chestStatus(4_999, 0)).toMatchObject({ earned: 0, available: 0, stepsToNext: 1 });
    expect(chestStatus(0, 5)).toMatchObject({ opened: 0, available: 0 });
  });
});
