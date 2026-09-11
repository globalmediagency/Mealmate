import { and, eq, inArray, sql } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { applyStepGains, refreshEggSteps } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { stepEntries, stravaConnections, type Creature, type StravaConnection } from "@/lib/db/schema";
import { stepCredit } from "@/lib/game/steps";
import { activityDate, activityStepEquivalent, sportLabel, syncGate, syncWindowStart } from "@/lib/game/strava";
import { gameDate } from "@/lib/game/time";
import type { StravaApi, StravaTokens } from "./api";

const REFRESH_MARGIN_MS = 5 * 60_000;
const PER_PAGE = 50;
const MAX_PAGES = 4;

/** Client-safe view: never exposes tokens. */
export type StravaStatus = {
  connected: boolean;
  athleteId: number | null;
  athleteName: string | null;
  lastSyncAt: string | null;
  /** When the next manual sync is allowed (null = now). */
  nextSyncAt: string | null;
};

export async function getConnection(userId: string): Promise<StravaConnection | null> {
  const rows = await getDb().select().from(stravaConnections).where(eq(stravaConnections.userId, userId)).limit(1);
  return rows[0] ?? null;
}

function toStatus(conn: StravaConnection | null, now: Date): StravaStatus {
  if (!conn) return { connected: false, athleteId: null, athleteName: null, lastSyncAt: null, nextSyncAt: null };
  const gate = syncGate(conn.lastSyncAt, now);
  return {
    connected: true,
    athleteId: conn.athleteId,
    athleteName: conn.athleteName,
    lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
    nextSyncAt: gate.retryAt?.toISOString() ?? null,
  };
}

export async function getStravaStatus(userId: string, now: Date = new Date()): Promise<StravaStatus> {
  return toStatus(await getConnection(userId), now);
}

/** Exchanges the OAuth code and stores (or replaces) the user's connection. */
export async function connectStrava(userId: string, code: string, api: StravaApi, now: Date = new Date()): Promise<StravaStatus> {
  const tokens = await api.exchangeCode(code);
  if (!tokens.athlete) throw new DomainError("strava_error", "Strava n'a pas renvoyé le profil de l'athlète.", 502);
  const values = {
    userId,
    athleteId: tokens.athlete.id,
    athleteName: tokens.athlete.name,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  const rows = await getDb()
    .insert(stravaConnections)
    .values(values)
    .onConflictDoUpdate({
      target: stravaConnections.userId,
      set: { athleteId: values.athleteId, athleteName: values.athleteName, accessToken: values.accessToken, refreshToken: values.refreshToken, expiresAt: values.expiresAt },
    })
    .returning();
  return toStatus(rows[0] ?? null, now);
}

/** Revokes the token at Strava (best effort) and forgets the connection. Imported steps are kept. */
export async function disconnectStrava(userId: string, api: StravaApi): Promise<void> {
  const conn = await getConnection(userId);
  if (!conn) return;
  try {
    await api.deauthorize(conn.accessToken);
  } catch (error) {
    console.warn("[strava] deauthorize error", error instanceof Error ? error.message : error);
  }
  await getDb().delete(stravaConnections).where(eq(stravaConnections.userId, userId));
}

async function persistTokens(userId: string, tokens: StravaTokens): Promise<void> {
  await getDb()
    .update(stravaConnections)
    .set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt })
    .where(eq(stravaConnections.userId, userId));
}

/** Access token valid for at least five more minutes, refreshing it when needed. */
async function freshAccessToken(conn: StravaConnection, api: StravaApi, now: Date): Promise<string> {
  if (conn.expiresAt.getTime() - now.getTime() > REFRESH_MARGIN_MS) return conn.accessToken;
  const tokens = await api.refresh(conn.refreshToken);
  await persistTokens(conn.userId, tokens);
  return tokens.accessToken;
}

export type ImportedActivity = { id: number; name: string; sport: string; date: string; steps: number };

export type SyncResult = {
  imported: ImportedActivity[];
  /** Activities already imported or worth zero steps. */
  skipped: number;
  gains: { healthGain: number; xpGain: number };
  status: StravaStatus;
  creature: Creature | null;
};

/**
 * Credits newly imported days to a living creature. Steps are compared per
 * day across every source so the "+10 health per day" cap holds, then all
 * entries of the day are marked credited (Σ credited = Σ steps).
 */
type Gains = { healthGain: number; xpGain: number };

/**
 * Converts the user's not-yet-credited steps of `dates` into gains, per day,
 * and marks them credited. Days before a creature's hatch day are skipped for
 * that creature by `gainsFor`.
 */
async function creditDays(userId: string, dates: string[]): Promise<Map<string, Gains>> {
  const db = getDb();
  const eligible = [...new Set(dates)];
  const byDate = new Map<string, Gains>();
  if (eligible.length === 0) return byDate;
  const rows = await db
    .select({ date: stepEntries.date, total: sql<number>`sum(${stepEntries.steps})`, credited: sql<number>`sum(${stepEntries.creditedSteps})` })
    .from(stepEntries)
    .where(and(eq(stepEntries.userId, userId), inArray(stepEntries.date, eligible)))
    .groupBy(stepEntries.date);
  for (const row of rows) {
    const credit = stepCredit(Number(row.total), Number(row.credited));
    byDate.set(row.date, { healthGain: credit.healthGain, xpGain: credit.xpGain });
  }
  await db
    .update(stepEntries)
    .set({ creditedSteps: sql`${stepEntries.steps}` })
    .where(and(eq(stepEntries.userId, userId), inArray(stepEntries.date, eligible), sql`${stepEntries.creditedSteps} <> ${stepEntries.steps}`));
  return byDate;
}

function gainsFor(creature: Creature, byDate: Map<string, Gains>): Gains {
  const since = creature.hatchedAt ? gameDate(creature.hatchedAt) : null;
  const gains = { healthGain: 0, xpGain: 0 };
  for (const [date, g] of byDate) {
    if (since !== null && date < since) continue;
    gains.healthGain += g.healthGain;
    gains.xpGain += g.xpGain;
  }
  return gains;
}

/**
 * Imports recent activities as step entries and applies their effects to
 * `creature` (the user's own egg or creature) and to every creature of
 * `others` (living creatures boarded with the user).
 */
export async function syncStrava(userId: string, api: StravaApi, creature: Creature | null, now: Date = new Date(), others: Creature[] = []): Promise<SyncResult> {
  const conn = await getConnection(userId);
  if (!conn) throw new DomainError("not_connected", "Connecte d'abord ton compte Strava.", 409);
  const gate = syncGate(conn.lastSyncAt, now);
  if (!gate.allowed) {
    throw new DomainError("too_soon", `Synchronisation déjà faite il y a peu : réessaie dans ${gate.retryInMinutes} min.`, 429);
  }

  const accessToken = await freshAccessToken(conn, api, now);
  const after = syncWindowStart(now, conn.lastSyncAt);
  const db = getDb();
  const imported: ImportedActivity[] = [];
  let skipped = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const activities = await api.listActivities(accessToken, { after, page, perPage: PER_PAGE });
    for (const activity of activities) {
      const steps = activityStepEquivalent(activity);
      if (steps < 1) {
        skipped += 1;
        continue;
      }
      const date = activityDate(activity.startDateLocal);
      const inserted = await db
        .insert(stepEntries)
        .values({ userId, date, steps, source: "strava", stravaActivityId: activity.id })
        .onConflictDoNothing({ target: stepEntries.stravaActivityId })
        .returning({ id: stepEntries.id });
      if (inserted.length === 0) skipped += 1;
      else imported.push({ id: activity.id, name: activity.name, sport: sportLabel(activity.sportType), date, steps });
    }
    if (activities.length < PER_PAGE) break;
  }

  const updated = await db.update(stravaConnections).set({ lastSyncAt: now }).where(eq(stravaConnections.userId, userId)).returning();

  let gains = { healthGain: 0, xpGain: 0 };
  let next = creature;
  if (creature?.status === "egg") next = await refreshEggSteps(creature);
  const living = [creature, ...others].filter((c): c is Creature => c !== null && c.status === "alive");
  if (living.length > 0 && imported.length > 0) {
    const byDate = await creditDays(userId, imported.map((a) => a.date));
    for (const held of living) {
      const heldGains = gainsFor(held, byDate);
      const updated = await applyStepGains(held, heldGains);
      if (creature && held.id === creature.id) {
        gains = heldGains;
        next = updated;
      }
    }
  }

  imported.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { imported, skipped, gains, status: toStatus(updated[0] ?? conn, now), creature: next };
}
