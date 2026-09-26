import { and, eq } from "drizzle-orm";
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
