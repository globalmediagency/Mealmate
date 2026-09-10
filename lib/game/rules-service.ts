import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { gameSettings } from "@/lib/db/schema";
import { DEFAULT_RULES, gameRulesPatchSchema, rulesFromDocument, type GameRules, type GameRulesPatch } from "./rules";

const SETTINGS_ID = "default";
const CACHE_TTL_MS = 60_000;

let memo: { rules: GameRules; at: number } | null = null;

/** Drops the in-memory cache (after a save, and in tests). */
export function invalidateRulesCache(): void {
  memo = null;
}

async function readRules(): Promise<GameRules> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  return rows[0] ? rulesFromDocument(rows[0].data) : DEFAULT_RULES;
}

/**
 * Effective game rules: admin overrides merged over the defaults. Cached per
 * request (React cache) and for one minute per server instance.
 */
export const getGameRules = cache(async (): Promise<GameRules> => {
  if (memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.rules;
  try {
    const rules = await readRules();
    memo = { rules, at: Date.now() };
    return rules;
  } catch (error) {
    // A missing table (migration not applied yet) must never break the game.
    console.error("[rules] falling back to defaults", error);
    return DEFAULT_RULES;
  }
});

export type StoredRules = { patch: GameRulesPatch; updatedAt: Date | null; updatedBy: string | null };

/** Raw stored overrides (for the admin form). */
export async function getStoredRules(): Promise<StoredRules> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  if (!rows[0]) return { patch: {}, updatedAt: null, updatedBy: null };
  const parsed = gameRulesPatchSchema.safeParse(rows[0].data);
  return { patch: parsed.success ? parsed.data : {}, updatedAt: rows[0].updatedAt, updatedBy: rows[0].updatedBy };
}

/** Replaces the overrides (validated) and returns the effective rules. */
export async function saveGameRules(patch: GameRulesPatch, updatedBy: string, now = new Date()): Promise<GameRules> {
  const data = gameRulesPatchSchema.parse(patch) as Record<string, unknown>;
  await getDb()
    .insert(gameSettings)
    .values({ id: SETTINGS_ID, data, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: gameSettings.id, set: { data, updatedAt: now, updatedBy } });
  invalidateRulesCache();
  return rulesFromDocument(data);
}

export async function resetGameRules(updatedBy: string): Promise<GameRules> {
  return saveGameRules({}, updatedBy);
}
