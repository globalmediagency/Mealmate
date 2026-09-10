import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { creatures, meals, user } from "@/lib/db/schema";
import { GAME_TIMEZONE } from "@/lib/game/config";
import { gameDate } from "@/lib/game/time";

export type AdminStats = {
  users: number;
  eggs: number;
  alive: number;
  sick: number;
  dead: number;
  mealsToday: number;
  mealsTotal: number;
};

/** Aggregate counters shown on the admin dashboard (no personal data). */
export async function getAdminStats(today = gameDate()): Promise<AdminStats> {
  const db = getDb();
  const [users] = await db.select({ count: sql<number>`count(*)` }).from(user);
  const [c] = await db
    .select({
      eggs: sql<number>`count(*) filter (where ${creatures.status} = 'egg')`,
      alive: sql<number>`count(*) filter (where ${creatures.status} = 'alive')`,
      sick: sql<number>`count(*) filter (where ${creatures.status} = 'alive' and ${creatures.sickSince} is not null)`,
      dead: sql<number>`count(*) filter (where ${creatures.status} = 'dead')`,
    })
    .from(creatures);
  const [m] = await db
    .select({
      total: sql<number>`count(*)`,
      today: sql<number>`count(*) filter (where (${meals.createdAt} at time zone ${sql.raw(`'${GAME_TIMEZONE}'`)})::date = ${today}::date)`,
    })
    .from(meals);
  return {
    users: Number(users?.count ?? 0),
    eggs: Number(c?.eggs ?? 0),
    alive: Number(c?.alive ?? 0),
    sick: Number(c?.sick ?? 0),
    dead: Number(c?.dead ?? 0),
    mealsToday: Number(m?.today ?? 0),
    mealsTotal: Number(m?.total ?? 0),
  };
}
