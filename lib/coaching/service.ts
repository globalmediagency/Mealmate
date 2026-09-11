import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { rewardPool } from "@/lib/accessories/catalog";
import { addAccessoryCopies, getOwnedAccessories, type ChestReward } from "@/lib/accessories/service";
import { DomainError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { coachings, mealReviews, meals, profiles, type Coaching } from "@/lib/db/schema";
import { getAcceptedFriend, publicProfiles, type PublicProfile } from "@/lib/friends/service";
import { drawAccessory } from "@/lib/game/accessories";
import { getDropWeights } from "@/lib/game/drops-service";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
import { listMeals, purgeExpiredMeals, type MealThumb, type MealView } from "@/lib/meals/service";
import type { ObjectStorage } from "@/lib/storage/r2";

export type CoachingRole = "student" | "coach";
export type CoachingStatus = Coaching["status"];

export type CoachingView = {
  id: string;
  status: CoachingStatus;
  student: PublicProfile;
  coach: PublicProfile;
  thumbsUp: number;
  thumbsDown: number;
  createdAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  endedBy: "student" | "coach" | null;
};

async function toViews(rows: Coaching[]): Promise<CoachingView[]> {
  const people = await publicProfiles(rows.flatMap((r) => [r.studentId, r.coachId]));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    student: people.get(r.studentId)!,
    coach: people.get(r.coachId)!,
    thumbsUp: r.thumbsUp,
    thumbsDown: r.thumbsDown,
    createdAt: r.createdAt.toISOString(),
    respondedAt: r.respondedAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
    endedBy: r.endedBy,
  }));
}

const toView = async (row: Coaching) => (await toViews([row]))[0];

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505";
}

async function openCoachingOf(studentId: string): Promise<Coaching | null> {
  const rows = await getDb()
    .select()
    .from(coachings)
    .where(and(eq(coachings.studentId, studentId), inArray(coachings.status, ["pending", "active"])))
    .limit(1);
  return rows[0] ?? null;
}

/** Asks an accepted friend to become the player's coach. One pending or active coaching per student. */
export async function proposeCoach(studentId: string, friendshipId: string, now: Date = new Date()): Promise<CoachingView> {
  const { friend } = await getAcceptedFriend(studentId, friendshipId);
  const existing = await openCoachingOf(studentId);
  if (existing) {
    throw new DomainError("coach_exists", existing.status === "active" ? "Tu as déjà un coach. Mets fin au coaching avant d'en choisir un autre." : "Une proposition est déjà en attente.", 409);
  }
  try {
    const [row] = await getDb().insert(coachings).values({ studentId, coachId: friend.userId, status: "pending", createdAt: now }).returning();
    return toView(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("coach_exists", "Une proposition est déjà en attente.", 409);
    throw error;
  }
}

/** The friend accepts or declines a coaching proposal (at most once). */
export async function respondToProposal(coachId: string, coachingId: string, accept: boolean, now: Date = new Date()): Promise<CoachingView> {
  const rows = await getDb()
    .update(coachings)
    .set({ status: accept ? "active" : "declined", respondedAt: now, studentSeenAt: null })
    .where(and(eq(coachings.id, coachingId), eq(coachings.coachId, coachId), eq(coachings.status, "pending")))
    .returning();
  if (!rows[0]) throw new DomainError("not_found", "Proposition introuvable ou déjà traitée.", 404);
  return toView(rows[0]);
}

/**
 * Either side ends the relationship at any time: a student cancels their
 * pending proposal or ends the coaching, a coach declines or ends it. The
 * thumb counters stay on the row; the rewards already earned are kept.
 */
export async function endCoaching(userId: string, coachingId: string, now: Date = new Date()): Promise<CoachingView> {
  const [row] = await getDb().select().from(coachings).where(eq(coachings.id, coachingId)).limit(1);
  if (!row || (row.studentId !== userId && row.coachId !== userId)) throw new DomainError("not_found", "Coaching introuvable.", 404);
  const role: CoachingRole = row.studentId === userId ? "student" : "coach";
  if (row.status !== "pending" && row.status !== "active") return toView(row);
  const status: CoachingStatus = row.status === "pending" ? (role === "student" ? "cancelled" : "declined") : "ended";
  const rows = await getDb()
    .update(coachings)
    .set({ status, endedAt: now, endedBy: role, respondedAt: row.status === "pending" ? now : row.respondedAt, studentSeenAt: role === "coach" ? null : row.studentSeenAt })
    .where(and(eq(coachings.id, coachingId), eq(coachings.status, row.status)))
    .returning();
  return toView(rows[0] ?? row);
}

export type StudentSide = {
  /** Pending proposal or active coaching, null when the player has no coach. */
  current: CoachingView | null;
  /** Answers and endings by the coach the student has not seen yet. */
  notices: CoachingView[];
};

export async function getStudentSide(studentId: string): Promise<StudentSide> {
  const db = getDb();
  const [current, unseen] = await Promise.all([
    openCoachingOf(studentId),
    db
      .select()
      .from(coachings)
      .where(
        and(
          eq(coachings.studentId, studentId),
          isNull(coachings.studentSeenAt),
          or(inArray(coachings.status, ["active", "declined"]), and(eq(coachings.status, "ended"), eq(coachings.endedBy, "coach"))),
        ),
      )
      .orderBy(desc(coachings.createdAt))
      .limit(5),
  ]);
  return { current: current ? await toView(current) : null, notices: await toViews(unseen) };
}

export async function markStudentNoticesSeen(studentId: string, now: Date = new Date()): Promise<void> {
  await getDb().update(coachings).set({ studentSeenAt: now }).where(and(eq(coachings.studentId, studentId), isNull(coachings.studentSeenAt)));
}

export type CoachSide = { proposals: CoachingView[]; students: CoachingView[] };

export async function getCoachSide(coachId: string): Promise<CoachSide> {
  const rows = await getDb()
    .select()
    .from(coachings)
    .where(and(eq(coachings.coachId, coachId), inArray(coachings.status, ["pending", "active"])))
    .orderBy(desc(coachings.createdAt));
  const views = await toViews(rows);
  return { proposals: views.filter((v) => v.status === "pending"), students: views.filter((v) => v.status === "active") };
}

/** Proposals received + unseen answers, for the badge on the Amis tab. */
export async function countCoachingBadges(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(coachings)
    .where(
      or(
        and(eq(coachings.coachId, userId), eq(coachings.status, "pending")),
        and(
          eq(coachings.studentId, userId),
          isNull(coachings.studentSeenAt),
          or(inArray(coachings.status, ["active", "declined"]), and(eq(coachings.status, "ended"), eq(coachings.endedBy, "coach"))),
        ),
      ),
    );
  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Thumbs on meals
// ---------------------------------------------------------------------------

async function activeCoachingFor(coachId: string, coachingId: string): Promise<Coaching> {
  const rows = await getDb()
    .select()
    .from(coachings)
    .where(and(eq(coachings.id, coachingId), eq(coachings.coachId, coachId), eq(coachings.status, "active")))
    .limit(1);
  if (!rows[0]) throw new DomainError("not_found", "Tu ne coaches pas cette personne.", 404);
  return rows[0];
}

export type StudentMeals = { coaching: CoachingView; meals: MealView[] };

/** The student's meals of the retention window (photos, scores, thumbs) for their coach. Expired meals are purged first. */
export async function studentMealsForCoach(coachId: string, coachingId: string, storage: ObjectStorage, now: Date = new Date(), rules?: GameRules): Promise<StudentMeals> {
  const coaching = await activeCoachingFor(coachId, coachingId);
  const gameRules = rules ?? (await getGameRules());
  await purgeExpiredMeals(coaching.studentId, storage, now, gameRules.feeding.mealRetentionDays);
  return { coaching: await toView(coaching), meals: await listMeals(coaching.studentId, storage, 100) };
}

export type ReviewOutcome = { review: MealThumb; thumbsUp: number; thumbsDown: number };

/** The coach gives (or changes) their thumb on one of the student's meals; counters follow. */
export async function reviewMeal(coachId: string, coachingId: string, mealId: string, verdict: MealThumb, now: Date = new Date()): Promise<ReviewOutcome> {
  const coaching = await activeCoachingFor(coachId, coachingId);
  const db = getDb();
  const [meal] = await db.select({ id: meals.id, userId: meals.userId }).from(meals).where(eq(meals.id, mealId)).limit(1);
  if (!meal || meal.userId !== coaching.studentId) throw new DomainError("not_found", "Ce repas n'existe plus.", 404);

  const inserted = await db
    .insert(mealReviews)
    .values({ mealId, coachingId, verdict, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: mealReviews.mealId })
    .returning({ mealId: mealReviews.mealId });
  let delta: { up: number; down: number } | null = null;
  if (inserted.length > 0) {
    delta = verdict === "up" ? { up: 1, down: 0 } : { up: 0, down: 1 };
  } else {
    const changed = await db
      .update(mealReviews)
      .set({ verdict, updatedAt: now })
      .where(and(eq(mealReviews.mealId, mealId), eq(mealReviews.coachingId, coachingId), sql`${mealReviews.verdict} <> ${verdict}`))
      .returning({ mealId: mealReviews.mealId });
    if (changed.length > 0) delta = verdict === "up" ? { up: 1, down: -1 } : { up: -1, down: 1 };
  }
  let counters = { thumbsUp: coaching.thumbsUp, thumbsDown: coaching.thumbsDown };
  if (delta) {
    const [updated] = await db
      .update(coachings)
      .set({ thumbsUp: sql`${coachings.thumbsUp} + ${delta.up}`, thumbsDown: sql`${coachings.thumbsDown} + ${delta.down}` })
      .where(eq(coachings.id, coachingId))
      .returning({ thumbsUp: coachings.thumbsUp, thumbsDown: coachings.thumbsDown });
    if (updated) counters = updated;
  }
  return { review: verdict, ...counters };
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export type RewardStatus = {
  /** Points counted so far (net thumbs received, or thumbs given). */
  points: number;
  /** Points per reward (admin rule). */
  per: number;
  earned: number;
  opened: number;
  available: number;
  /** Points still needed for the next reward. */
  toNext: number;
};

function rewardStatus(points: number, per: number, opened: number): RewardStatus {
  const step = Math.max(1, per);
  const earned = Math.floor(points / step);
  return { points, per: step, earned, opened, available: Math.max(0, earned - opened), toNext: step - (points % step) };
}

/** Surprise accessories earned as a student (net thumbs received) and as a coach (thumbs given). */
export async function rewardStatuses(userId: string, rules?: GameRules): Promise<Record<CoachingRole, RewardStatus>> {
  const gameRules = rules ?? (await getGameRules());
  const db = getDb();
  const [[asStudent], [asCoach], [profile]] = await Promise.all([
    db
      .select({ points: sql<number>`coalesce(sum(greatest(${coachings.thumbsUp} - ${coachings.thumbsDown}, 0)), 0)` })
      .from(coachings)
      .where(eq(coachings.studentId, userId)),
    db.select({ points: sql<number>`coalesce(sum(${coachings.thumbsUp} + ${coachings.thumbsDown}), 0)` }).from(coachings).where(eq(coachings.coachId, userId)),
    db.select({ student: profiles.studentRewardsOpened, coach: profiles.coachRewardsOpened }).from(profiles).where(eq(profiles.userId, userId)),
  ]);
  return {
    student: rewardStatus(Number(asStudent?.points ?? 0), gameRules.coaching.thumbsPerStudentReward, profile?.student ?? 0),
    coach: rewardStatus(Number(asCoach?.points ?? 0), gameRules.coaching.thumbsPerCoachReward, profile?.coach ?? 0),
  };
}

export type CoachingReward = Omit<ChestReward, "status" | "equipped"> & { reward: RewardStatus };

/** Opens one earned surprise accessory: the pool is every chest accessory plus the ones reserved to the role. */
export async function openCoachingReward(userId: string, role: CoachingRole, rules?: GameRules, random?: () => number): Promise<CoachingReward> {
  const gameRules = rules ?? (await getGameRules());
  const status = (await rewardStatuses(userId, gameRules))[role];
  if (status.available <= 0) throw new DomainError("no_reward", "Pas de récompense à ouvrir pour le moment.", 409);
  const column = role === "student" ? profiles.studentRewardsOpened : profiles.coachRewardsOpened;
  const claimed = await getDb()
    .update(profiles)
    .set(role === "student" ? { studentRewardsOpened: status.opened + 1 } : { coachRewardsOpened: status.opened + 1 })
    .where(and(eq(profiles.userId, userId), eq(column, status.opened)))
    .returning({ userId: profiles.userId });
  if (claimed.length === 0) throw new DomainError("no_reward", "Cette récompense a déjà été ouverte.", 409);
  const [ownedList, weights] = await Promise.all([getOwnedAccessories(userId), getDropWeights()]);
  const owned = new Set(ownedList.map((o) => o.accessory.id));
  const draw = drawAccessory(owned, random, weights.accessories, rewardPool(role));
  const copies = await addAccessoryCopies(userId, draw.accessory.id);
  return { accessory: draw.accessory, duplicate: draw.duplicate, copies, reward: rewardStatus(status.points, status.per, status.opened + 1) };
}
