import { randomUUID } from "node:crypto";
import { isSuspiciousPhoto, type PhotoSource } from "@/lib/ai/meal-schema";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { MealAnalyzer } from "@/lib/ai/gemini";
import type { MealAnalysis } from "@/lib/ai/meal-schema";
import { DomainError } from "@/lib/api/errors";
import { getHeldCreatures, livingHeld, type HeldCreature } from "@/lib/boarding/service";
import { getDb } from "@/lib/db";
import { creatures, mealReviews, meals, type Creature, type Meal } from "@/lib/db/schema";
import { FEEDING, GAME_TIMEZONE, HEALTH_STATE, type Tier } from "@/lib/game/config";
import { mealEffects, type MealEffects } from "@/lib/game/meal-effects";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
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
  rules?: GameRules;
};

/** Effects of the meal on one creature fed by the user. */
export type FedCreature = {
  creature: Creature;
  effects: MealEffects;
  before: { health: number; hunger: number; mood: number };
  /** Boarded with the user: the owner's name, null for the user's own creature. */
  ownerName: string | null;
};

export type FeedResult = {
  meal: Meal;
  imageUrl: string;
  analysis: MealAnalysis;
  /** Effects on the main creature (the user's own when home, else the first boarded one). */
  effects: MealEffects;
  before: { health: number; hunger: number; mood: number };
  creature: Creature;
  mealsToday: number;
  /** The other creatures fed by the same meal (boarded with the user). */
  others: FedCreature[];
};

/**
 * Feeds every living creature the user takes care of with one photo: limits,
 * duplicate check, AI analysis, storage, persistence and stat effects
 * (spec § 3.5). Creatures boarded with the user eat the same meal.
 */
export async function feedCreature(input: FeedInput): Promise<FeedResult> {
  const now = input.now ?? new Date();
  const { userId, image, analyzer, storage } = input;
  const rules = input.rules ?? (await getGameRules());

  const held = await getHeldCreatures(userId, now, rules);
  const fed = livingHeld(held);
  if (fed.length === 0) {
    if (held.own && held.away) {
      throw new DomainError("creature_boarded", `${held.own.name ?? "Ta créature"} est en pension chez ${held.away.host.username} : c'est ${held.away.host.username} qui la nourrit pour le moment.`, 409);
    }
    if (!held.own || held.own.status === "egg") {
      throw new DomainError("no_creature", "Tu n'as pas encore de créature à nourrir.", 409);
    }
    throw new DomainError("creature_dead", "Ta créature n'est plus là… Choisis un nouvel œuf pour continuer.", 409);
  }
  const creature = fed[0].creature;

  const today = gameDate(now);
  const mealsToday = await countMealsToday(userId, today);
  const maxMeals = rules.feeding.maxMealsPerDay;
  if (mealsToday >= maxMeals) {
    throw new DomainError("meal_limit", `${maxMeals} repas aujourd'hui, c'est déjà très bien. On se retrouve demain !`, 429);
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
  // Screen / printed pictures: flagged on the meal; refused outright when the admin rule is on.
  if (isSuspiciousPhoto(analysis.photo_source) && rules.feeding.rejectScreenPhotos) {
    throw new DomainError("screen_photo", "Cette photo semble prise depuis un écran ou une image imprimée. Photographie ta vraie assiette !", 422);
  }

  const effects = mealEffects({ score: analysis.score, tier: creature.tier as Tier, hunger: creature.hunger, rules });
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
      photoSource: analysis.photo_source,
    })
    .returning();

  // Every creature in the user's care eats: effects depend on each one's tier and hunger.
  const results: FedCreature[] = [];
  for (const held of fed) {
    const target = held.creature;
    const own = target.id === creature.id ? effects : mealEffects({ score: analysis.score, tier: target.tier as Tier, hunger: target.hunger, rules });
    const health = clamp(target.health + own.healthDelta, 0, 100);
    const [updated] = await db
      .update(creatures)
      .set({
        health,
        hunger: clamp(target.hunger + own.hungerDelta, 0, 100),
        mood: clamp(target.mood + own.moodDelta, 0, 100),
        xp: target.xp + own.xpDelta,
        sickSince: health >= HEALTH_STATE.tiredMin ? null : target.sickSince,
      })
      .where(and(eq(creatures.id, target.id), eq(creatures.status, "alive")))
      .returning();
    results.push({ creature: updated ?? target, effects: own, before: { health: target.health, hunger: target.hunger, mood: target.mood }, ownerName: ownerNameOf(held) });
  }

  const [main, ...others] = results;
  return {
    meal,
    imageUrl: await storage.signedUrl(key),
    analysis,
    effects: main.effects,
    before: main.before,
    creature: main.creature,
    mealsToday: mealsToday + 1,
    others,
  };
}

const ownerNameOf = (held: HeldCreature) => held.owner?.username ?? null;

/** The coach's thumb on a meal, as shown to the student and the coach. */
export type MealThumb = "up" | "down";

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
  photoSource: PhotoSource;
  /** Thumb given by the coach, null when not reviewed (spec § 3.17). */
  review: MealThumb | null;
};

export async function toMealView(meal: Meal, storage: ObjectStorage, review: MealThumb | null = null): Promise<MealView> {
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
    photoSource: meal.photoSource as PhotoSource,
    review,
  };
}

/**
 * Deletes the user's meals older than `retentionDays` (photo first, then the
 * row; a photo that cannot be removed keeps its row for a later try). Called
 * lazily when a history is read. Returns how many meals went away.
 */
export async function purgeExpiredMeals(userId: string, storage: ObjectStorage, now: Date, retentionDays: number): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const db = getDb();
  const expired = await db.select({ id: meals.id, imageKey: meals.imageKey }).from(meals).where(and(eq(meals.userId, userId), lt(meals.createdAt, cutoff)));
  let removed = 0;
  for (const meal of expired) {
    try {
      await storage.remove(meal.imageKey);
    } catch (error) {
      console.error(`[meals] could not remove photo ${meal.imageKey}, keeping the meal for now`, error);
      continue;
    }
    await db.delete(meals).where(eq(meals.id, meal.id));
    removed += 1;
  }
  return removed;
}

/** Recent meals (most recent first) with short-lived signed image URLs and the coach's thumb. */
export async function listMeals(userId: string, storage: ObjectStorage, limit = 60): Promise<MealView[]> {
  const rows = await getDb()
    .select({ meal: meals, review: mealReviews.verdict })
    .from(meals)
    .leftJoin(mealReviews, eq(mealReviews.mealId, meals.id))
    .where(eq(meals.userId, userId))
    .orderBy(desc(meals.createdAt))
    .limit(limit);
  return Promise.all(rows.map((row) => toMealView(row.meal, storage, row.review ?? null)));
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
