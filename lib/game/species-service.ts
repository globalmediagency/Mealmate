import { eq } from "drizzle-orm";
import { cache } from "react";
import { DomainError } from "@/lib/api/errors";
import { getSpecies, speciesForTier } from "@/lib/creatures";
import { getDb } from "@/lib/db";
import { gameSettings } from "@/lib/db/schema";
import { isConfigError } from "@/lib/env";
import type { Tier } from "./config";

/**
 * Species switched off from /admin (spec § 3.20): their owners keep them,
 * they simply never come out of an egg again. Stored as one `game_settings`
 * document, `{ disabled: [speciesId, …] }`, next to the drop weights.
 */
const SETTINGS_ID = "species";
const CACHE_TTL_MS = 60_000;

let memo: { disabled: ReadonlySet<string>; at: number } | null = null;

export function invalidateDisabledSpeciesCache(): void {
  memo = null;
}

/** Ids of the stored document that are still species of the roster (a removed species is forgotten). */
function parse(document: unknown): string[] {
  const list = document && typeof document === "object" ? (document as { disabled?: unknown }).disabled : undefined;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((id): id is string => typeof id === "string" && getSpecies(id) !== undefined))];
}

async function readDisabled(): Promise<string[]> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  return rows[0] ? parse(rows[0].data) : [];
}

/** Disabled species ids. Cached per request and for one minute per instance; an unreachable table disables nothing. */
export const getDisabledSpecies = cache(async (): Promise<ReadonlySet<string>> => {
  if (memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.disabled;
  try {
    const disabled = new Set(await readDisabled());
    memo = { disabled, at: Date.now() };
    return disabled;
  } catch (error) {
    if (!isConfigError(error)) console.error("[species] falling back to every species enabled", error);
    return new Set();
  }
});

export type StoredDisabledSpecies = { disabled: string[]; updatedAt: Date | null; updatedBy: string | null };

export async function getStoredDisabledSpecies(): Promise<StoredDisabledSpecies> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  if (!rows[0]) return { disabled: [], updatedAt: null, updatedBy: null };
  return { disabled: parse(rows[0].data), updatedAt: rows[0].updatedAt, updatedBy: rows[0].updatedBy };
}

/** Species of `tier` that would still hatch with `disabled` switched off. */
export function enabledSpeciesOfTier(tier: Tier, disabled: ReadonlySet<string>): string[] {
  return speciesForTier(tier)
    .filter((species) => !disabled.has(species.id))
    .map((species) => species.id);
}

/**
 * Switches one species in or out of the egg draws. The last enabled species
 * of a tier cannot be switched off: an egg of that tier must still hatch.
 * Returns the disabled ids after the change.
 */
export async function setSpeciesEnabled(speciesId: string, enabled: boolean, updatedBy: string, now = new Date()): Promise<string[]> {
  const species = getSpecies(speciesId);
  if (!species) throw new DomainError("not_found", "Espèce inconnue.", 404);
  const current = new Set(await readDisabled());
  if (enabled) current.delete(species.id);
  else {
    current.add(species.id);
    if (enabledSpeciesOfTier(species.tier, current).length === 0) {
      throw new DomainError("last_species", `Impossible de désactiver ${species.name} : c'est la dernière espèce du niveau qui peut encore éclore.`, 400);
    }
  }
  const disabled = [...current].sort();
  const data: Record<string, unknown> = { disabled };
  await getDb()
    .insert(gameSettings)
    .values({ id: SETTINGS_ID, data, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: gameSettings.id, set: { data, updatedAt: now, updatedBy } });
  invalidateDisabledSpeciesCache();
  return disabled;
}

/** The species a player may still discover: every enabled one, plus the disabled ones they already own. */
export function discoverableSpecies<T extends { id: string }>(list: readonly T[], disabled: ReadonlySet<string>, obtained: ReadonlySet<string>): T[] {
  return list.filter((species) => !disabled.has(species.id) || obtained.has(species.id));
}
