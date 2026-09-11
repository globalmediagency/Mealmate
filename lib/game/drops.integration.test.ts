import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { gameSettings } from "@/lib/db/schema";
import { speciesForTier } from "@/lib/creatures";
import { createTestDatabase, type TestDatabase } from "@/lib/test/pglite";
import { defaultAccessoryWeight, defaultSpeciesWeight } from "./drops";
import { getDropWeights, getStoredDropWeights, invalidateDropWeightsCache, saveDropWeights } from "./drops-service";
import { getAccessory } from "@/lib/accessories/catalog";

let tdb: TestDatabase;

beforeAll(async () => {
  tdb = await createTestDatabase();
  invalidateDropWeightsCache();
});

afterAll(async () => {
  await tdb.close();
});

describe("drop weights storage", () => {
  it("starts empty, merges patches per map and removes overrides with null", async () => {
    expect(await getDropWeights()).toEqual({ species: {}, accessories: {} });
    await saveDropWeights({ kind: "species", weights: { "facile-chat-rond": 12, "facile-lapin-doux": 0 } }, "chef");
    await saveDropWeights({ kind: "accessories", weights: { halo: 5 } }, "chef");
    const stored = await getStoredDropWeights();
    expect(stored.weights).toEqual({ species: { "facile-chat-rond": 12, "facile-lapin-doux": 0 }, accessories: { halo: 5 } });
    expect(stored.updatedBy).toBe("chef");
    await saveDropWeights({ kind: "species", weights: { "facile-chat-rond": null } }, "chef");
    expect((await getDropWeights()).species).toEqual({ "facile-lapin-doux": 0 });
    expect((await getDropWeights()).accessories).toEqual({ halo: 5 });
  });

  it("rejects weights outside 0–100", async () => {
    await expect(saveDropWeights({ kind: "species", weights: { "facile-chat-rond": 100.001 } }, "chef")).rejects.toThrow();
    await expect(saveDropWeights({ kind: "species", weights: { "facile-chat-rond": -1 } }, "chef")).rejects.toThrow();
  });

  it("quantises to 0.001 %, drops overrides equal to the default and ignores unknown ids", async () => {
    const chat = speciesForTier("facile").find((s) => s.id === "facile-chat-rond")!;
    await saveDropWeights({ kind: "species", weights: { "facile-chat-rond": 1.23456, "facile-inconnu": 50 } }, "chef");
    expect((await getDropWeights()).species["facile-chat-rond"]).toBe(1.235);
    expect((await getDropWeights()).species["facile-inconnu"]).toBeUndefined();
    await saveDropWeights({ kind: "species", weights: { "facile-chat-rond": defaultSpeciesWeight(chat) + 0.0001 } }, "chef");
    expect((await getDropWeights()).species["facile-chat-rond"]).toBeUndefined();
    await saveDropWeights({ kind: "accessories", weights: { halo: defaultAccessoryWeight(getAccessory("halo")!) } }, "chef");
    expect((await getDropWeights()).accessories.halo).toBeUndefined();
  });

  it("refuses a pool whose weights would all be 0", async () => {
    const zero = Object.fromEntries(speciesForTier("moyen").map((s) => [s.id, 0]));
    await expect(saveDropWeights({ kind: "species", weights: zero }, "chef")).rejects.toMatchObject({ code: "empty_pool", status: 400 });
    expect((await getDropWeights()).species[speciesForTier("moyen")[0].id]).toBeUndefined();
    const [first, ...rest] = speciesForTier("moyen");
    await saveDropWeights({ kind: "species", weights: { ...Object.fromEntries(rest.map((s) => [s.id, 0])), [first.id]: 1 } }, "chef");
    expect((await getDropWeights()).species[first.id]).toBe(1);
  });

  it("salvages the valid entries of a hand-edited document", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const data = { unit: "percent", species: { "facile-chat-rond": 101, "facile-lapin-doux": 5 }, accessories: "oops" };
    await getDb().update(gameSettings).set({ data }).where(eq(gameSettings.id, "drops"));
    invalidateDropWeightsCache();
    expect((await getStoredDropWeights()).weights).toEqual({ species: { "facile-lapin-doux": 5 }, accessories: {} });
    await saveDropWeights({ kind: "accessories", weights: { halo: 3 } }, "chef");
    expect(await getDropWeights()).toEqual({ species: { "facile-lapin-doux": 5 }, accessories: { halo: 3 } });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("reads a legacy per-mille document (no unit) as percent, warns, drops garbage and rewrites it in percent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const legacy = { species: { "facile-lapin-doux": 50, "facile-chat-rond": "120", "facile-pipo": true }, accessories: { halo: 2.5 } };
    await getDb().update(gameSettings).set({ data: legacy }).where(eq(gameSettings.id, "drops"));
    invalidateDropWeightsCache();
    expect((await getStoredDropWeights()).weights).toEqual({ species: { "facile-lapin-doux": 5, "facile-chat-rond": 12 }, accessories: { halo: 0.25 } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("legacy per-mille"));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("facile-pipo"), true);
    warn.mockRestore();
    error.mockRestore();
    await saveDropWeights({ kind: "species", weights: { "facile-chat-rond": 1 } }, "chef");
    const [row] = await getDb().select().from(gameSettings).where(eq(gameSettings.id, "drops"));
    expect(row.data).toEqual({ unit: "percent", species: { "facile-lapin-doux": 5, "facile-chat-rond": 1 }, accessories: { halo: 0.25 } });
    expect(await getDropWeights()).toEqual({ species: { "facile-lapin-doux": 5, "facile-chat-rond": 1 }, accessories: { halo: 0.25 } });
  });
});
