import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { creatures, type Creature } from "@/lib/db/schema";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
import { applyTick } from "@/lib/game/tick";

/**
 * Applies the lazy tick to a living creature and persists it. The update is
 * guarded by `last_tick_at` (optimistic concurrency): if another request
 * ticked first, the fresh row is re-read instead of being overwritten.
 */
export async function tickCreature(creature: Creature, now: Date = new Date(), rules?: GameRules): Promise<Creature> {
  const result = applyTick(creature, now, rules ?? (await getGameRules()));
  if (!result.changed) return creature;
  const next = result.creature;
  const db = getDb();
  const rows = await db
    .update(creatures)
    .set({
      hunger: next.hunger,
      health: next.health,
      mood: next.mood,
      sickSince: next.sickSince,
      lastTickAt: next.lastTickAt,
      status: next.status,
      diedAt: next.diedAt,
      deathCause: next.deathCause,
      lifespanDays: next.lifespanDays,
    })
    .where(
      and(
        eq(creatures.id, creature.id),
        eq(creatures.status, "alive"),
        sql`date_trunc('milliseconds', ${creatures.lastTickAt}) = ${creature.lastTickAt}`,
      ),
    )
    .returning();
  if (rows[0]) return rows[0];
  const fresh = await db.select().from(creatures).where(eq(creatures.id, creature.id)).limit(1);
  return fresh[0] ?? next;
}
