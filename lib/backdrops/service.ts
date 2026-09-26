import { and, eq, isNotNull, sql } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { creatures, userBackdrops, type Creature } from "@/lib/db/schema";
import { getBackdrop, THEME_BACKDROPS, type Backdrop } from "./catalog";

export type OwnedBackdrop = { backdrop: Backdrop; obtainedAt: Date };

/** The chest backdrops a player has found (the design scenes are always available and never stored). */
export async function getOwnedBackdrops(userId: string): Promise<OwnedBackdrop[]> {
  const rows = await getDb().select().from(userBackdrops).where(eq(userBackdrops.userId, userId));
  return rows
    .map((row) => {
      const backdrop = getBackdrop(row.backdropId);
      return backdrop ? { backdrop, obtainedAt: row.obtainedAt } : null;
    })
    .filter((item): item is OwnedBackdrop => item !== null)
    .sort((a, b) => b.obtainedAt.getTime() - a.obtainedAt.getTime());
}

/** Gives a backdrop to a player (idempotent: a backdrop already found stays a single row). Returns whether it was new. */
export async function addBackdrop(userId: string, backdropId: string, now = new Date()): Promise<boolean> {
  const rows = await getDb().insert(userBackdrops).values({ userId, backdropId, obtainedAt: now }).onConflictDoNothing().returning({ id: userBackdrops.backdropId });
  return rows.length > 0;
}

/** Whether a player may put a backdrop behind their creature: a design scene, or a chest scene they found. */
export async function canUseBackdrop(userId: string, backdropId: string): Promise<boolean> {
  if (THEME_BACKDROPS.some((b) => b.id === backdropId)) return true;
  const rows = await getDb()
    .select({ id: userBackdrops.backdropId })
    .from(userBackdrops)
    .where(and(eq(userBackdrops.userId, userId), eq(userBackdrops.backdropId, backdropId)))
    .limit(1);
  return rows.length > 0;
}

/** Sets (or clears with `null`: follow the design) the backdrop of the user's own living creature. Returns the stored value. */
export async function setCreatureBackdrop(userId: string, creature: Creature, backdropId: string | null): Promise<string | null> {
  if (creature.userId !== userId) throw new DomainError("forbidden", "Cette créature n'est pas la tienne.", 403);
  if (creature.status !== "alive") throw new DomainError("no_creature", "Seule une créature vivante peut changer de décor.", 409);
  if (backdropId !== null) {
    if (!getBackdrop(backdropId)) throw new DomainError("unknown_backdrop", "Fond inconnu.", 404);
    if (!(await canUseBackdrop(userId, backdropId))) throw new DomainError("not_owned", "Tu n'as pas encore trouvé ce fond.", 403);
  }
  await getDb().update(creatures).set({ backdrop: backdropId }).where(eq(creatures.id, creature.id));
  return backdropId;
}

export type BackdropStats = {
  /** Players who found each chest backdrop (design scenes are never stored). */
  found: Record<string, number>;
  /** Living creatures currently showing each backdrop (`NULL` = following the design, counted in `followingDesign`). */
  inUse: Record<string, number>;
  followingDesign: number;
};

/** Counts for the admin « Fonds » tab: who found what, and what the living creatures show. */
export async function countBackdropStats(): Promise<BackdropStats> {
  const db = getDb();
  const [foundRows, useRows, following] = await Promise.all([
    db.select({ id: userBackdrops.backdropId, count: sql<number>`count(*)::int` }).from(userBackdrops).groupBy(userBackdrops.backdropId),
    db
      .select({ id: creatures.backdrop, count: sql<number>`count(*)::int` })
      .from(creatures)
      .where(and(eq(creatures.status, "alive"), isNotNull(creatures.backdrop)))
      .groupBy(creatures.backdrop),
    db.select({ count: sql<number>`count(*)::int` }).from(creatures).where(and(eq(creatures.status, "alive"), sql`${creatures.backdrop} is null`)),
  ]);
  const found: Record<string, number> = {};
  for (const row of foundRows) found[row.id] = Number(row.count);
  const inUse: Record<string, number> = {};
  for (const row of useRows) if (row.id) inUse[row.id] = Number(row.count);
  return { found, inUse, followingDesign: Number(following[0]?.count ?? 0) };
}
