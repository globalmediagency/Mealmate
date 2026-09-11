import { eq } from "drizzle-orm";
import { cache } from "react";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { gameSettings } from "@/lib/db/schema";
import { isConfigError } from "@/lib/env";
import { TIERS } from "./config";
import { accessoryWeights, defaultWeightsById, dropWeightsSchema, EMPTY_DROP_WEIGHTS, isAllZero, quantizeWeight, speciesWeights, weightEntrySchema, type DropWeights } from "./drops";

const SETTINGS_ID = "drops";
const CACHE_TTL_MS = 60_000;

let memo: { weights: DropWeights; at: number } | null = null;

export function invalidateDropWeightsCache(): void {
  memo = null;
}

/**
 * Parses the stored document. A hand-edited row (Neon's SQL editor) with one
 * bad entry must not wipe every override: invalid entries are dropped one by
 * one and logged, valid ones survive.
 */
function parse(document: unknown): DropWeights {
  const whole = dropWeightsSchema.safeParse(document ?? {});
  if (whole.success) return whole.data;
  const salvaged: DropWeights = { species: {}, accessories: {} };
  const source = (document && typeof document === "object" ? document : {}) as Record<string, unknown>;
  for (const kind of ["species", "accessories"] as const) {
    const map = source[kind];
    if (!map || typeof map !== "object") continue;
    for (const [id, value] of Object.entries(map as Record<string, unknown>)) {
      const entry = weightEntrySchema.safeParse(value);
      if (entry.success) salvaged[kind][id] = entry.data;
      else console.error(`[drops] ignoring invalid stored weight ${kind}.${id}:`, value);
    }
  }
  return salvaged;
}

async function readWeights(): Promise<DropWeights> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  return rows[0] ? parse(rows[0].data) : EMPTY_DROP_WEIGHTS;
}

/** Admin drop-weight overrides (‰ per item). Cached per request and for one minute per instance. */
export const getDropWeights = cache(async (): Promise<DropWeights> => {
  if (memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.weights;
  try {
    const weights = await readWeights();
    memo = { weights, at: Date.now() };
    return weights;
  } catch (error) {
    // A missing table or an unconfigured database must never break hatching or chests.
    if (!isConfigError(error)) console.error("[drops] falling back to defaults", error);
    return EMPTY_DROP_WEIGHTS;
  }
});

export type StoredDropWeights = { weights: DropWeights; updatedAt: Date | null; updatedBy: string | null };

export async function getStoredDropWeights(): Promise<StoredDropWeights> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  if (!rows[0]) return { weights: EMPTY_DROP_WEIGHTS, updatedAt: null, updatedBy: null };
  return { weights: parse(rows[0].data), updatedAt: rows[0].updatedAt, updatedBy: rows[0].updatedBy };
}

export type DropWeightsPatch = { kind: keyof DropWeights; weights: Record<string, number | null> };

/** Names the pools (tier or catalogue) whose weights would all be 0 with `next`. */
function emptyPools(next: DropWeights): string[] {
  const names: string[] = [];
  for (const tier of TIERS) if (isAllZero(speciesWeights(tier, next.species))) names.push(`créatures · niveau ${tier}`);
  if (isAllZero(accessoryWeights(next.accessories))) names.push("accessoires");
  return names;
}

/**
 * Merges a patch into one map: a number sets the override (quantised to
 * 0.01 ‰, dropped when equal to the rarity default), null removes it. Unknown
 * ids are ignored, the other map is untouched, and a pool whose weights would
 * all be 0 is refused so the game never silently falls back to the defaults.
 */
export async function saveDropWeights(patch: DropWeightsPatch, updatedBy: string, now = new Date()): Promise<DropWeights> {
  const current = await readWeights();
  const defaults = defaultWeightsById()[patch.kind];
  const map = { ...current[patch.kind] };
  for (const [id, value] of Object.entries(patch.weights)) {
    const defaultWeight = defaults.get(id);
    if (defaultWeight === undefined) continue;
    if (value === null || quantizeWeight(value) === quantizeWeight(defaultWeight)) delete map[id];
    else map[id] = quantizeWeight(value);
  }
  const next = dropWeightsSchema.parse({ ...current, [patch.kind]: map });
  const empty = emptyPools(next);
  if (empty.length > 0) {
    throw new DomainError("empty_pool", `Impossible de tout mettre à 0 (${empty.join(", ")}) : au moins un objet du groupe doit pouvoir sortir.`, 400);
  }
  const data = next as Record<string, unknown>;
  await getDb()
    .insert(gameSettings)
    .values({ id: SETTINGS_ID, data, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: gameSettings.id, set: { data, updatedAt: now, updatedBy } });
  invalidateDropWeightsCache();
  return next;
}
