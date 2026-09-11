/**
 * Who holds a creature on a given day. Steps walked by the holder feed the
 * creature's chest counter, so a boarded creature keeps earning chests for
 * its host and the owner's steps during the stay do not count.
 */

/** A stay at a friend's: game dates, `from` inclusive, `to` exclusive (null = still there). */
export type CustodySegment = { hostId: string; from: string; to: string | null };

export type DailyUserSteps = { userId: string; date: string; steps: number };

/** User who holds the creature on `date` (the owner outside every stay). */
export function holderOn(date: string, ownerId: string, segments: readonly CustodySegment[]): string {
  for (const segment of segments) {
    if (date >= segment.from && (segment.to === null || date < segment.to)) return segment.hostId;
  }
  return ownerId;
}

/** Sum of the holder's steps on each day ≥ `since` (other users' steps on that day are ignored). */
export function custodySteps(rows: readonly DailyUserSteps[], ownerId: string, segments: readonly CustodySegment[], since: string): number {
  let total = 0;
  for (const row of rows) {
    if (row.date < since) continue;
    if (holderOn(row.date, ownerId, segments) === row.userId) total += Math.max(0, row.steps);
  }
  return total;
}

/** Whole days left before `endsAt` (never negative; a partial day counts as one). */
export function daysLeft(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
}
