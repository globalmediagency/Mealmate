import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { boardings, stepEntries, type Creature } from "@/lib/db/schema";
import { gameDate } from "@/lib/game/time";
import { sumStepsSince } from "@/lib/steps/service";
import { custodySteps, type CustodySegment } from "./custody";

/** Every stay of the creature (past and current) as day segments, oldest first. */
export async function custodySegments(creatureId: string): Promise<CustodySegment[]> {
  const rows = await getDb()
    .select({ hostId: boardings.hostId, startedAt: boardings.startedAt, endedAt: boardings.endedAt })
    .from(boardings)
    .where(eq(boardings.creatureId, creatureId))
    .orderBy(asc(boardings.startedAt));
  return rows.map((row) => ({ hostId: row.hostId, from: gameDate(row.startedAt), to: row.endedAt ? gameDate(row.endedAt) : null }));
}

/**
 * Steps that count for the creature on days ≥ `fromDate`: the owner's, except
 * during a stay at a friend's where the host's steps count instead. Without
 * any stay this is simply the owner's total.
 */
export async function creatureStepsSince(creature: Pick<Creature, "id" | "userId">, fromDate: string): Promise<number> {
  const segments = await custodySegments(creature.id);
  if (segments.length === 0) return sumStepsSince(creature.userId, fromDate);
  const userIds = [...new Set([creature.userId, ...segments.map((s) => s.hostId)])];
  const rows = await getDb()
    .select({ userId: stepEntries.userId, date: stepEntries.date, total: sql<number>`sum(${stepEntries.steps})` })
    .from(stepEntries)
    .where(and(inArray(stepEntries.userId, userIds), gte(stepEntries.date, fromDate)))
    .groupBy(stepEntries.userId, stepEntries.date);
  return custodySteps(
    rows.map((row) => ({ userId: row.userId, date: row.date, steps: Number(row.total) })),
    creature.userId,
    segments,
    fromDate,
  );
}
