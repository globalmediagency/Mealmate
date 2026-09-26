import { eq, isNotNull, sql } from "drizzle-orm";
import { cache } from "react";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { gameSettings, profiles } from "@/lib/db/schema";
import { isConfigError } from "@/lib/env";
import { BUILTIN_DEFAULT_THEME, DEFAULT_THEME_SETTINGS, isThemeId, THEME_BY_ID, type ThemeId, type ThemeSettings } from "./catalog";

/**
 * What the admin decided about the designs (spec § 3.27): the one served by
 * default and the ones players may no longer pick, in one `game_settings`
 * document, `{ default: id, disabled: [ids] }`; and what each player chose
 * (`profiles.theme`, migration 020).
 */
const SETTINGS_ID = "themes";
const CACHE_TTL_MS = 60_000;

let memo: { settings: ThemeSettings; at: number } | null = null;

export function invalidateThemeSettingsCache(): void {
  memo = null;
}

/** The stored document, ids unknown to the catalogue dropped; the default is never among the disabled. */
function parse(document: unknown): ThemeSettings {
  const source = document && typeof document === "object" ? (document as { default?: unknown; disabled?: unknown }) : {};
  const defaultId = isThemeId(source.default) ? source.default : BUILTIN_DEFAULT_THEME;
  const disabled = new Set<ThemeId>();
  if (Array.isArray(source.disabled)) for (const id of source.disabled) if (isThemeId(id) && id !== defaultId) disabled.add(id);
  return { defaultId, disabled };
}

async function readSettings(): Promise<ThemeSettings> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  return rows[0] ? parse(rows[0].data) : DEFAULT_THEME_SETTINGS;
}

/** Cached per request and for one minute per instance; an unreachable database serves the shipped design to everyone. */
export const getThemeSettings = cache(async (): Promise<ThemeSettings> => {
  if (memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.settings;
  try {
    const settings = await readSettings();
    memo = { settings, at: Date.now() };
    return settings;
  } catch (error) {
    if (!isConfigError(error)) console.error("[themes] falling back to the shipped design", error);
    return DEFAULT_THEME_SETTINGS;
  }
});

export type StoredThemeSettings = ThemeSettings & { updatedAt: Date | null; updatedBy: string | null };

export async function getStoredThemeSettings(): Promise<StoredThemeSettings> {
  const rows = await getDb().select().from(gameSettings).where(eq(gameSettings.id, SETTINGS_ID)).limit(1);
  if (!rows[0]) return { ...DEFAULT_THEME_SETTINGS, updatedAt: null, updatedBy: null };
  return { ...parse(rows[0].data), updatedAt: rows[0].updatedAt, updatedBy: rows[0].updatedBy };
}

export type ThemeSettingsPatch = { id: string; enabled?: boolean; default?: true };

/**
 * One admin move on one design: switch it in or out of the picker, or make
 * it the default. The default design is always enabled (promoting a disabled
 * one enables it; disabling the default is refused, `default_theme`).
 */
export async function updateThemeSettings(patch: ThemeSettingsPatch, updatedBy: string, now = new Date()): Promise<ThemeSettings> {
  if (!isThemeId(patch.id)) throw new DomainError("not_found", "Design inconnu.", 404);
  const current = await readSettings();
  let defaultId = current.defaultId;
  const disabled = new Set(current.disabled);
  if (patch.default) {
    defaultId = patch.id;
    disabled.delete(patch.id);
  }
  if (patch.enabled === true) disabled.delete(patch.id);
  if (patch.enabled === false) {
    if (patch.id === defaultId) {
      throw new DomainError("default_theme", `${THEME_BY_ID[patch.id].name} est le design par défaut : choisis-en un autre par défaut avant de le désactiver.`, 400);
    }
    disabled.add(patch.id);
  }
  const data: Record<string, unknown> = { default: defaultId, disabled: [...disabled].sort() };
  await getDb()
    .insert(gameSettings)
    .values({ id: SETTINGS_ID, data, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: gameSettings.id, set: { data, updatedAt: now, updatedBy } });
  invalidateThemeSettingsCache();
  return { defaultId, disabled };
}

/**
 * The player's choice (`null` = follow the admin's default). A design the
 * admin disabled cannot be chosen (`theme_disabled`); an unknown id is refused.
 */
export async function setUserTheme(userId: string, themeId: string | null): Promise<ThemeId | null> {
  if (themeId !== null) {
    if (!isThemeId(themeId)) throw new DomainError("not_found", "Design inconnu.", 404);
    const settings = await getThemeSettings();
    if (settings.disabled.has(themeId)) throw new DomainError("theme_disabled", "Ce design n'est plus proposé.", 400);
  }
  const rows = await getDb().update(profiles).set({ theme: themeId }).where(eq(profiles.userId, userId)).returning({ theme: profiles.theme });
  if (!rows[0]) throw new DomainError("not_found", "Profil introuvable.", 404);
  return themeId;
}

/** How many players chose each design explicitly (the admin page). */
export async function countThemeChoices(): Promise<Partial<Record<ThemeId, number>>> {
  const rows = await getDb()
    .select({ theme: profiles.theme, count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(isNotNull(profiles.theme))
    .groupBy(profiles.theme);
  const counts: Partial<Record<ThemeId, number>> = {};
  for (const row of rows) if (isThemeId(row.theme)) counts[row.theme] = Number(row.count);
  return counts;
}
