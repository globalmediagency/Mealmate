import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { MealAnalyzer } from "@/lib/ai/gemini";
import type { MealAnalysis } from "@/lib/ai/meal-schema";
import { DomainError } from "@/lib/api/errors";
import { getActiveCreatureTicked } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { creatures, meals, type Creature, type Meal } from "@/lib/db/schema";
import { FEEDING, GAME_TIMEZONE, HEALTH_STATE, type Tier } from "@/lib/game/config";
import { mealEffects, type MealEffects } from "@/lib/game/meal-effects";
import { gameDate, shiftDate } from "@/lib/game/time";
import type { ObjectStorage } from "@/lib/storage/r2";
import { mealImageKey } from "@/lib/storage/r2";
import { imageHash } from "./hash";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** SQL expression: calendar date of a timestamp in the game timezone (literal so GROUP BY matches). */
const gameDay = (column: typeof meals.createdAt) =>
  sql`(${column} at time zone ${sql.raw(`'${GAME_TIMEZONE}'`)})::date`;

export async function countMealsToday(userId: string, today = gameDate()): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(meals)
    .where(and(eq(meals.userId, userId), sql`${gameDay(meals.createdAt)} = ${today}::date`));
  return Number(rows[0]?.count ?? 0);
}

export async function findRecentDuplicate(userId: string, hash: string, since: Date): Promise<Meal | null> {
  const rows = await getDb()
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.imageHash, hash), gte(meals.createdAt, since)))
    .limit(1);
  return rows[0] ?? null;
}

export type FeedInput = {
  userId: string;
  image: { bytes: Uint8Array; mimeType: string };
  analyzer: MealAnalyzer;
  storage: ObjectStorage;
  now?: Date;
};

export type FeedResult = {
  meal: Meal;
  imageUrl: string;
  analysis: MealAnalysis;
  effects: MealEffects;
  before: { health: number; hunger: number; mood: number };
  creature: Creature;
  mealsToday: number;
};

/**
 * Feeds the user's living creature with a photo: limits, duplicate check,
 * AI analysis, storage, persistence and stat effects (spec § 3.5).
 */
export async function feedCreature(input: FeedInput): Promise<FeedResult> {
  const now = input.now ?? new Date();
  const { userId, image, analyzer, storage } = input;

  const creature = await getActiveCreatureTicked(userId, now);
  if (!creature || creature.status === "egg") {
    throw new DomainError("no_creature", "Tu n'as pas encore de créature à nourrir.", 409);
  }
  if (creature.status === "dead") {
    throw new DomainError("creature_dead", "Ta créature n'est plus là… Choisis un nouvel œuf pour continuer.", 409);
  }

  const today = gameDate(now);
  const mealsToday = await countMealsToday(userId, today);
  if (mealsToday >= FEEDING.maxMealsPerDay) {
    throw new DomainError(
      "meal_limit",
      `${FEEDING.maxMealsPerDay} repas aujourd'hui, c'est déjà très bien. On se retrouve demain !`,
      429,
    );
  }

  const hash = imageHash(image.bytes);
  const since = new Date(now.getTime() - FEEDING.duplicateWindowHours * 3_600_000);
  if (await findRecentDuplicate(userId, hash, since)) {
    throw new DomainError("duplicate_meal", "Cette photo a déjà été servie il y a moins de 24 h. Un autre repas ?", 409);
  }

  const analysis = await analyzer(image);
  if (!analysis.is_food) {
    throw new DomainError("not_food", "Je ne reconnais pas de repas sur cette photo.", 422);
  }

  const effects = mealEffects({ score: analysis.score, tier: creature.tier as Tier, hunger: creature.hunger });
  const mealId = randomUUID();
  const key = mealImageKey(userId, mealId);
  await storage.put(key, image.bytes, image.mimeType);

  const db = getDb();
  const [meal] = await db
    .insert(meals)
    .values({
      id: mealId,
      creatureId: creature.id,
      userId,
      imageKey: key,
      imageHash: hash,
      score: analysis.score,
      verdict: analysis.verdict,
      foods: analysis.foods,
      macros: analysis.macros,
      portion: analysis.portion,
      comment: analysis.comment,
      creatureLine: analysis.creature_line,
      healthDelta: effects.healthDelta,
      createdAt: now,
    })
    .returning();

  const health = clamp(creature.health + effects.healthDelta, 0, 100);
  const [updated] = await db
    .update(creatures)
    .set({
      health,
      hunger: clamp(creature.hunger + effects.hungerDelta, 0, 100),
      mood: clamp(creature.mood + effects.moodDelta, 0, 100),
      xp: creature.xp + effects.xpDelta,
      sickSince: health >= HEALTH_STATE.tiredMin ? null : creature.sickSince,
    })
    .where(eq(creatures.id, creature.id))
    .returning();

  return {
    meal,
    imageUrl: await storage.signedUrl(key),
    analysis,
    effects,
    before: { health: creature.health, hunger: creature.hunger, mood: creature.mood },
    creature: updated ?? creature,
    mealsToday: mealsToday + 1,
  };
}

export type MealView = {
  id: string;
  imageUrl: string;
  score: number;
  verdict: Meal["verdict"];
  foods: string[];
  macros: Record<string, number>;
  portion: string | null;
  comment: string | null;
  creatureLine: string | null;
  healthDelta: number;
  createdAt: string;
};

export async function toMealView(meal: Meal, storage: ObjectStorage): Promise<MealView> {
  return {
    id: meal.id,
    imageUrl: await storage.signedUrl(meal.imageKey),
    score: meal.score,
    verdict: meal.verdict,
    foods: meal.foods,
    macros: meal.macros,
    portion: meal.portion,
    comment: meal.comment,
    creatureLine: meal.creatureLine,
    healthDelta: meal.healthDelta,
    createdAt: meal.createdAt.toISOString(),
  };
}

/** Recent meals (most recent first) with short-lived signed image URLs. */
export async function listMeals(userId: string, storage: ObjectStorage, limit = 60): Promise<MealView[]> {
  const rows = await getDb()
    .select()
    .from(meals)
    .where(eq(meals.userId, userId))
    .orderBy(desc(meals.createdAt))
    .limit(limit);
  return Promise.all(rows.map((meal) => toMealView(meal, storage)));
}

export type DailyScore = { date: string; average: number | null; count: number };

export type MealStats = {
  daily: DailyScore[];
  weekAverage: number | null;
  monthAverage: number | null;
  weekCount: number;
  todayCount: number;
};

/** Daily average scores over the last 30 days (zero-filled) + weekly / monthly averages. */
export async function mealStats(userId: string, today = gameDate()): Promise<MealStats> {
  const from = shiftDate(today, -29);
  const rows = await getDb()
    .select({
      date: sql<string>`${gameDay(meals.createdAt)}::text`,
      average: sql<number>`avg(${meals.score})`,
      count: sql<number>`count(*)`,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), sql`${gameDay(meals.createdAt)} >= ${from}::date`))
    .groupBy(sql`${gameDay(meals.createdAt)}`);
  const byDate = new Map(rows.map((r) => [r.date, { average: Number(r.average), count: Number(r.count) }]));
  const daily: DailyScore[] = [];
  for (let i = 0; i < 30; i += 1) {
    const date = shiftDate(from, i);
    const entry = byDate.get(date);
    daily.push({ date, average: entry ? Math.round(entry.average) : null, count: entry?.count ?? 0 });
  }
  const weighted = (days: DailyScore[]) => {
    const total = days.reduce((s, d) => s + (d.average ?? 0) * d.count, 0);
    const count = days.reduce((s, d) => s + d.count, 0);
    return { average: count ? Math.round(total / count) : null, count };
  };
  const week = weighted(daily.slice(-7));
  const month = weighted(daily);
  return {
    daily,
    weekAverage: week.average,
    monthAverage: month.average,
    weekCount: week.count,
    todayCount: daily[daily.length - 1]?.count ?? 0,
  };
}
