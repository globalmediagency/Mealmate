import { and, eq, sql } from "drizzle-orm";
import { assertHolder, type HolderOptions } from "@/lib/accessories/service";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { creatures, playSessions, type Creature } from "@/lib/db/schema";
import { GAME_TIMEZONE, PLAY } from "@/lib/game/config";
import { playEffects, type PlayEffects } from "@/lib/game/play";
import { gameDate } from "@/lib/game/time";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Games played with this creature today, whoever played (the limit follows the creature). */
export async function countPlaysToday(creatureId: string, today = gameDate()): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(playSessions)
    .where(
      and(
        eq(playSessions.creatureId, creatureId),
        sql`(${playSessions.createdAt} at time zone ${sql.raw(`'${GAME_TIMEZONE}'`)})::date = ${today}::date`,
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

export type PlayResult = { effects: PlayEffects; creature: Creature; playsToday: number; playsLeft: number };

/** Records a finished mini-game and applies its effects (max 3 per day and per creature). */
export async function recordPlay(userId: string, creature: Creature, score: number, now = new Date(), options: HolderOptions = {}): Promise<PlayResult> {
  assertHolder(userId, creature, options);
  if (creature.status !== "alive") throw new DomainError("no_creature", "Tu n'as pas de créature avec qui jouer.", 409);
  const today = gameDate(now);
  const playsToday = await countPlaysToday(creature.id, today);
  if (playsToday >= PLAY.maxPerDay) {
    throw new DomainError("play_limit", `${PLAY.maxPerDay} parties aujourd'hui, elle a besoin de souffler. À demain !`, 429);
  }
  const safeScore = clamp(Math.round(score), 0, 100);
  const effects = playEffects(safeScore);
  const db = getDb();
  await db.insert(playSessions).values({ creatureId: creature.id, userId, score: safeScore, createdAt: now });
  const [updated] = await db
    .update(creatures)
    .set({ mood: clamp(creature.mood + effects.moodDelta, 0, 100), xp: creature.xp + effects.xpDelta })
    .where(eq(creatures.id, creature.id))
    .returning();
  return { effects, creature: updated ?? creature, playsToday: playsToday + 1, playsLeft: PLAY.maxPerDay - playsToday - 1 };
}
