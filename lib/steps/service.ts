import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { stepEntries, type Creature, type StepEntry } from "@/lib/db/schema";
import { clampManualSteps, stepCredit } from "@/lib/game/steps";
import { gameDate, shiftDate } from "@/lib/game/time";

export type DailySteps = { date: string; steps: number };

/** Total steps (all sources) on days >= `fromDate` (YYYY-MM-DD). */
export async function sumStepsSince(userId: string, fromDate: string): Promise<number> {
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${stepEntries.steps}), 0)` })
    .from(stepEntries)
    .where(and(eq(stepEntries.userId, userId), gte(stepEntries.date, fromDate)));
  return Number(rows[0]?.total ?? 0);
}

/** Today's manual entry, if any. */
export async function getManualEntry(userId: string, date: string): Promise<StepEntry | null> {
  const rows = await getDb()
    .select()
    .from(stepEntries)
    .where(
      and(eq(stepEntries.userId, userId), eq(stepEntries.date, date), eq(stepEntries.source, "manual")),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Steps per day (all sources summed) for the last `days` days, oldest first, zero-filled. */
export async function getStepHistory(userId: string, days: number, today = gameDate()): Promise<DailySteps[]> {
  const from = shiftDate(today, -(days - 1));
  const rows = await getDb()
    .select({ date: stepEntries.date, total: sql<number>`sum(${stepEntries.steps})` })
    .from(stepEntries)
    .where(and(eq(stepEntries.userId, userId), gte(stepEntries.date, from)))
    .groupBy(stepEntries.date)
    .orderBy(desc(stepEntries.date));
  const byDate = new Map(rows.map((row) => [row.date, Number(row.total)]));
  const history: DailySteps[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = shiftDate(from, i);
    history.push({ date, steps: byDate.get(date) ?? 0 });
  }
  return history;
}

export type SaveStepsResult = {
  entry: StepEntry;
  gains: { healthGain: number; xpGain: number };
};

/**
 * Creates or updates today's manual entry, then converts any newly walked
 * thousands into creature effects (handled by the caller for the creature row).
 */
export async function saveManualSteps(
  userId: string,
  rawSteps: number,
  creature: Creature | null,
  today = gameDate(),
): Promise<SaveStepsResult> {
  const steps = clampManualSteps(rawSteps);
  const previous = await getManualEntry(userId, today);
  const rows = await getDb()
    .insert(stepEntries)
    .values({ userId, date: today, steps, source: "manual" })
    .onConflictDoUpdate({
      target: [stepEntries.userId, stepEntries.date, stepEntries.source],
      targetWhere: sql`${stepEntries.source} = 'manual'`,
      set: { steps },
    })
    .returning();
  let entry = rows[0];

  let gains = { healthGain: 0, xpGain: 0 };
  if (creature?.status === "alive") {
    const credit = stepCredit(steps, previous?.creditedSteps ?? 0);
    gains = { healthGain: credit.healthGain, xpGain: credit.xpGain };
    if (credit.credited !== entry.creditedSteps) {
      const updated = await getDb()
        .update(stepEntries)
        .set({ creditedSteps: credit.credited })
        .where(eq(stepEntries.id, entry.id))
        .returning();
      entry = updated[0] ?? entry;
    }
  }
  return { entry, gains };
}
