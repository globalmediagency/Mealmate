import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rewardPool, sourceOf } from "@/lib/accessories/catalog";
import { getOwnedAccessories } from "@/lib/accessories/service";
import { countUserFootprint, exportAccount } from "@/lib/account/service";
import type { MealAnalysis } from "@/lib/ai/meal-schema";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { meals, profiles } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { DEFAULT_RULES, mergeRules } from "@/lib/game/rules";
import { feedCreature, listMeals } from "@/lib/meals/service";
import { saveManualSteps } from "@/lib/steps/service";
import type { ObjectStorage } from "@/lib/storage/r2";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import {
  countCoachingBadges,
  endCoaching,
  getCoachSide,
  getStudentSide,
  markStudentNoticesSeen,
  openCoachingReward,
  proposeCoach,
  respondToProposal,
  reviewMeal,
  rewardStatuses,
  studentMealsForCoach,
} from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;
let withBob: string;
let withCarol: string;
let coachingId: string;
const mealIds: string[] = [];
const DAY = 86_400_000;
const NOW = new Date();

const stored = new Map<string, Uint8Array>();
const storage: ObjectStorage = {
  async put(key, bytes) {
    stored.set(key, bytes);
  },
  async signedUrl(key) {
    return `https://signed.example/${key}`;
  },
  async remove(key) {
    stored.delete(key);
  },
  async removePrefix() {
    return 0;
  },
};
const analyzer = async (): Promise<MealAnalysis> => ({
  is_food: true,
  score: 80,
  verdict: "sain",
  foods: ["soupe"],
  macros: { proteins: 3, fibers: 4, carbs: 3, fats: 2, sugars: 1, ultra_processed: 1 },
  portion: "raisonnable",
  comment: "Bien.",
  creature_line: "Miam.",
  photo_source: "real",
});
let photo = 0;
const image = () => ({ bytes: new TextEncoder().encode(`coach-photo-${photo++}`), mimeType: "image/jpeg" });

async function befriend(a: string, bUsername: string, b: string): Promise<string> {
  await sendFriendRequest(a, bUsername);
  const [request] = (await listRequests(b)).incoming;
  await acceptFriendRequest(b, request.id);
  return request.id;
}

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice-coach@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob-coach@example.com", "Bob");
  carol = await insertTestUser(tdb.db, "carol-coach@example.com", "Carol");
  await getDb().insert(profiles).values([
    { userId: alice, username: "AliceC", friendCode: "MM-COACH1" },
    { userId: bob, username: "BobC", friendCode: "MM-COACH2" },
    { userId: carol, username: "CarolC", friendCode: "MM-COACH3" },
  ]);
  withBob = await befriend(alice, "BobC", bob);
  withCarol = await befriend(alice, "CarolC", carol);
  await createEgg(alice, "facile");
  await saveManualSteps(alice, 15_000, await getActiveCreature(alice));
  await hatchEgg(alice);
  await nameCreature(alice, "Miso");
  for (let i = 0; i < 2; i += 1) {
    const result = await feedCreature({ userId: alice, image: image(), analyzer, storage, now: new Date(NOW.getTime() - i * 3_600_000) });
    mealIds.push(result.meal.id);
  }
  // A meal from 40 days ago, older than the retention rule.
  const creature = (await getActiveCreature(alice))!;
  await storage.put("meals/old", new Uint8Array([1]), "image/jpeg");
  const [old] = await getDb()
    .insert(meals)
    .values({ creatureId: creature.id, userId: alice, imageKey: "meals/old", imageHash: "old", score: 50, verdict: "correct", createdAt: new Date(NOW.getTime() - 40 * DAY) })
    .returning({ id: meals.id });
  mealIds.push(old.id);
});

afterAll(async () => {
  await tdb.close();
});

describe("choosing a coach", () => {
  it("sends one proposal at a time to an accepted friend", async () => {
    const proposal = await proposeCoach(alice, withBob);
    expect(proposal.status).toBe("pending");
    expect(proposal.coach.username).toBe("BobC");
    coachingId = proposal.id;
    await expect(proposeCoach(alice, withCarol)).rejects.toMatchObject({ code: "coach_exists" });
    await expect(proposeCoach(bob, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "not_found" });
    expect((await getStudentSide(alice)).current?.status).toBe("pending");
    expect((await getCoachSide(bob)).proposals.map((p) => p.student.username)).toEqual(["AliceC"]);
    expect(await countCoachingBadges(bob)).toBe(1);
    expect(await countCoachingBadges(alice)).toBe(0);
  });

  it("lets only the chosen friend answer, and tells the student", async () => {
    await expect(respondToProposal(carol, coachingId, true)).rejects.toMatchObject({ code: "not_found" });
    const active = await respondToProposal(bob, coachingId, true);
    expect(active.status).toBe("active");
    await expect(respondToProposal(bob, coachingId, false)).rejects.toMatchObject({ code: "not_found" });
    const side = await getStudentSide(alice);
    expect(side.current?.status).toBe("active");
    expect(side.notices.map((n) => n.status)).toEqual(["active"]);
    expect(await countCoachingBadges(alice)).toBe(1);
    await markStudentNoticesSeen(alice);
    expect(await countCoachingBadges(alice)).toBe(0);
    expect((await getCoachSide(bob)).students.map((s) => s.student.username)).toEqual(["AliceC"]);
  });
});

describe("meals and thumbs", () => {
  it("shows the coach the student's recent meals and purges the expired ones (photo included)", async () => {
    await expect(studentMealsForCoach(carol, coachingId, storage, NOW)).rejects.toMatchObject({ code: "not_found" });
    const view = await studentMealsForCoach(bob, coachingId, storage, NOW, DEFAULT_RULES);
    expect(view.coaching.student.username).toBe("AliceC");
    expect(view.meals.map((m) => m.id)).toEqual([mealIds[0], mealIds[1]]);
    expect(view.meals[0].imageUrl).toContain("https://signed.example/");
    expect(stored.has("meals/old")).toBe(false);
    expect((await listMeals(alice, storage)).map((m) => m.id)).toEqual([mealIds[0], mealIds[1]]);
  });

  it("counts thumbs, lets the coach change their mind and shows the thumb to the student", async () => {
    expect(await reviewMeal(bob, coachingId, mealIds[0], "up")).toEqual({ review: "up", thumbsUp: 1, thumbsDown: 0 });
    expect(await reviewMeal(bob, coachingId, mealIds[0], "up")).toEqual({ review: "up", thumbsUp: 1, thumbsDown: 0 });
    expect(await reviewMeal(bob, coachingId, mealIds[0], "down")).toEqual({ review: "down", thumbsUp: 0, thumbsDown: 1 });
    expect(await reviewMeal(bob, coachingId, mealIds[0], "up")).toEqual({ review: "up", thumbsUp: 1, thumbsDown: 0 });
    expect(await reviewMeal(bob, coachingId, mealIds[1], "up")).toEqual({ review: "up", thumbsUp: 2, thumbsDown: 0 });
    await expect(reviewMeal(bob, coachingId, "00000000-0000-4000-8000-000000000000", "up")).rejects.toMatchObject({ code: "not_found" });
    await expect(reviewMeal(carol, coachingId, mealIds[1], "up")).rejects.toMatchObject({ code: "not_found" });
    expect((await listMeals(alice, storage)).map((m) => m.review)).toEqual(["up", "up"]);
  });

  it("gives surprise accessories to the student (net thumbs) and to the coach (thumbs given), from their own pools", async () => {
    const rules = mergeRules({ coaching: { thumbsPerStudentReward: 2, thumbsPerCoachReward: 2 } });
    const before = await rewardStatuses(alice, rules);
    expect(before.student).toEqual({ points: 2, per: 2, earned: 1, opened: 0, available: 1, toNext: 2 });
    expect((await rewardStatuses(bob, rules)).coach).toMatchObject({ points: 2, earned: 1, available: 1 });
    expect((await rewardStatuses(alice, DEFAULT_RULES)).student).toMatchObject({ points: 2, per: 5, earned: 0, available: 0, toNext: 3 });

    const studentReward = await openCoachingReward(alice, "student", rules, () => 0.999);
    expect(rewardPool("student").some((a) => a.id === studentReward.accessory.id)).toBe(true);
    expect(sourceOf(studentReward.accessory)).not.toBe("coach");
    expect(studentReward.reward).toMatchObject({ opened: 1, available: 0 });
    expect((await getOwnedAccessories(alice)).some((o) => o.accessory.id === studentReward.accessory.id)).toBe(true);
    await expect(openCoachingReward(alice, "student", rules)).rejects.toMatchObject({ code: "no_reward" });

    const coachReward = await openCoachingReward(bob, "coach", rules, () => 0.5);
    expect(rewardPool("coach").some((a) => a.id === coachReward.accessory.id)).toBe(true);
    expect(sourceOf(coachReward.accessory)).not.toBe("student");
    await expect(openCoachingReward(bob, "coach", rules)).rejects.toMatchObject({ code: "no_reward" });
    await expect(openCoachingReward(carol, "coach", rules)).rejects.toMatchObject({ code: "no_reward" });
  });
});

describe("ending", () => {
  it("lets either side end it; counters and rewards stay", async () => {
    await expect(endCoaching(carol, coachingId)).rejects.toMatchObject({ code: "not_found" });
    const ended = await endCoaching(alice, coachingId);
    expect(ended).toMatchObject({ status: "ended", endedBy: "student", thumbsUp: 2, thumbsDown: 0 });
    expect((await endCoaching(alice, coachingId)).status).toBe("ended");
    expect((await getStudentSide(alice)).current).toBeNull();
    expect((await getCoachSide(bob)).students).toEqual([]);
    expect((await rewardStatuses(alice, DEFAULT_RULES)).student.points).toBe(2);
    const exported = await exportAccount(alice);
    expect((exported.coachings as Array<{ with: string; thumbsUp: number }>)[0]).toMatchObject({ with: "BobC", thumbsUp: 2 });
    expect((await countUserFootprint(alice)).coachings).toBe(1);
    // The thumbs on the meals are gone with the relationship? No: they stay on the meal until it is purged.
    expect((await listMeals(alice, storage)).map((m) => m.review)).toEqual(["up", "up"]);
  });

  it("handles a declined proposal and an ending by the coach with notices for the student", async () => {
    const toCarol = await proposeCoach(alice, withCarol);
    expect((await respondToProposal(carol, toCarol.id, false)).status).toBe("declined");
    expect((await getStudentSide(alice)).notices.map((n) => n.status)).toEqual(["declined"]);
    await markStudentNoticesSeen(alice);

    const again = await proposeCoach(alice, withBob);
    await respondToProposal(bob, again.id, true);
    await markStudentNoticesSeen(alice);
    const byCoach = await endCoaching(bob, again.id);
    expect(byCoach).toMatchObject({ status: "ended", endedBy: "coach" });
    expect((await getStudentSide(alice)).notices.map((n) => [n.status, n.endedBy])).toEqual([["ended", "coach"]]);
    expect(await countCoachingBadges(alice)).toBe(1);

    // A pending proposal withdrawn by the student is "cancelled", declined by the coach is "declined".
    const pending = await proposeCoach(alice, withCarol);
    expect((await endCoaching(alice, pending.id)).status).toBe("cancelled");
    const pending2 = await proposeCoach(alice, withCarol);
    expect((await endCoaching(carol, pending2.id)).status).toBe("declined");
    const rows = await getDb().select().from(meals).where(eq(meals.userId, alice));
    expect(rows).toHaveLength(2);
  });
});
