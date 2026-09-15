import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getAccessory } from "@/lib/accessories/catalog";
import { getSpecies } from "@/lib/creatures";
import { getDb } from "@/lib/db";
import { boardings, creatureOutfits, creatures, friendships, meals, profiles, stepEntries, user, type Creature } from "@/lib/db/schema";
import { TIER_CONFIG, RARITY_LABELS, type Rarity, type Tier } from "@/lib/game/config";
import { moodEffectsFor, toCreatureView, type CreatureState, type CreatureStatus } from "@/lib/game/creature-view";
import { moodBand, MOOD_BAND_LABELS } from "@/lib/game/mood";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
import { applyTick } from "@/lib/game/tick";
import { gameDate } from "@/lib/game/time";
import { sumStepsSince } from "@/lib/steps/service";

/** A player's current (or latest) creature as the admin sees it: live stats, characteristics, marker. */
export type AdminCreature = {
  id: string;
  status: CreatureStatus;
  tier: Tier;
  tierLabel: string;
  name: string | null;
  speciesId: string | null;
  speciesName: string | null;
  tagline: string | null;
  rarity: Rarity | null;
  rarityLabel: string | null;
  stage: string;
  stageLabel: string;
  state: CreatureState;
  health: number;
  hunger: number;
  mood: number;
  moodLabel: string;
  xp: number;
  xpToNextStage: number | null;
  eggSteps: number;
  hatchSteps: number;
  ageDays: number;
  createdAt: string;
  hatchedAt: string | null;
  sickSince: string | null;
  daysUntilDeath: number | null;
  protectedUntil: string | null;
  diedAt: string | null;
  deathCause: string | null;
  lifespanDays: number | null;
  accessoryDrops: number;
  chestBonusSteps: number;
  /** Names of the accessories worn. */
  accessories: string[];
  /** Printed marker number, null until first use (the admin button assigns it). */
  arMarker: number | null;
};

export type AdminPlayer = {
  userId: string;
  username: string;
  friendCode: string;
  email: string;
  createdAt: string;
  creature: AdminCreature | null;
  /** Whether `creature` is the active one (egg / alive) or the latest dead one. */
  creatureIsCurrent: boolean;
  counts: { meals: number; steps: number; friends: number; deadCreatures: number };
  /** Host's username while the player's creature is boarded elsewhere. */
  awayAt: string | null;
  /** Creatures the player is hosting right now. */
  hosting: number;
};

function toAdminCreature(row: Creature, now: Date, rules: GameRules, accessories: string[]): AdminCreature {
  const ticked = row.status === "alive" ? applyTick(row, now, rules).creature : row;
  const view = toCreatureView(ticked, now, rules);
  const species = ticked.speciesId ? getSpecies(ticked.speciesId) : undefined;
  const effects = moodEffectsFor(ticked, rules);
  return {
    id: ticked.id,
    status: view.status,
    tier: view.tier,
    tierLabel: TIER_CONFIG[view.tier].label,
    name: ticked.name,
    speciesId: ticked.speciesId,
    speciesName: species?.name ?? null,
    tagline: species?.tagline ?? null,
    rarity: view.rarity,
    rarityLabel: view.rarity ? RARITY_LABELS[view.rarity] : null,
    stage: view.stage.id,
    stageLabel: view.stage.label,
    state: view.state,
    health: view.health,
    hunger: view.hunger,
    mood: view.mood,
    moodLabel: ticked.status === "alive" ? `${MOOD_BAND_LABELS[moodBand(ticked.mood, rules.mood)]}${effects.xpPercent ? ` (XP ${effects.xpPercent > 0 ? "+" : ""}${effects.xpPercent} %)` : ""}` : "",
    xp: view.xp,
    xpToNextStage: view.xpToNextStage,
    eggSteps: view.eggSteps,
    hatchSteps: view.hatchSteps,
    ageDays: view.ageDays,
    createdAt: view.createdAt,
    hatchedAt: view.hatchedAt,
    sickSince: view.sickSince,
    daysUntilDeath: view.daysUntilDeath,
    protectedUntil: view.protectedUntil,
    diedAt: view.diedAt,
    deathCause: ticked.deathCause,
    lifespanDays: view.lifespanDays,
    accessoryDrops: ticked.accessoryDrops,
    chestBonusSteps: ticked.chestBonusSteps,
    accessories,
    arMarker: ticked.arMarker,
  };
}

/**
 * Every player with their creature (the active egg or living one, otherwise
 * the latest dead one, stats ticked in memory without writing), their
 * activity counters and boarding situation. Admin only: emails included.
 */
export async function listPlayers(now: Date = new Date(), rules?: GameRules): Promise<AdminPlayer[]> {
  const gameRules = rules ?? (await getGameRules());
  const db = getDb();
  const people = await db
    .select({ userId: profiles.userId, username: profiles.username, friendCode: profiles.friendCode, createdAt: profiles.createdAt, email: user.email })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .orderBy(desc(profiles.createdAt));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.userId);

  const [allCreatures, mealCounts, stepSums, friendRows, activeBoardings] = await Promise.all([
    db.select().from(creatures).where(inArray(creatures.userId, ids)).orderBy(desc(creatures.createdAt)),
    db.select({ userId: meals.userId, count: sql<number>`count(*)` }).from(meals).where(inArray(meals.userId, ids)).groupBy(meals.userId),
    db.select({ userId: stepEntries.userId, total: sql<number>`coalesce(sum(${stepEntries.steps}), 0)` }).from(stepEntries).where(inArray(stepEntries.userId, ids)).groupBy(stepEntries.userId),
    db
      .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
      .from(friendships)
      .where(and(eq(friendships.status, "accepted"), or(inArray(friendships.requesterId, ids), inArray(friendships.addresseeId, ids)))),
    db.select({ ownerId: boardings.ownerId, hostId: boardings.hostId }).from(boardings).where(and(eq(boardings.status, "active"), isNull(boardings.endedAt))),
  ]);

  const shown = new Map<string, Creature>();
  const dead = new Map<string, number>();
  for (const c of allCreatures) {
    if (c.status === "dead") dead.set(c.userId, (dead.get(c.userId) ?? 0) + 1);
    const current = shown.get(c.userId);
    if (!current) shown.set(c.userId, c);
    else if (current.status === "dead" && c.status !== "dead") shown.set(c.userId, c);
  }
  // Eggs: the stored count only refreshes when the player opens the app, so read the real total.
  for (const [userId, c] of shown) {
    if (c.status === "egg") shown.set(userId, { ...c, eggSteps: await sumStepsSince(c.userId, gameDate(c.createdAt)) });
  }
  const outfitRows = shown.size > 0 ? await db.select().from(creatureOutfits).where(inArray(creatureOutfits.creatureId, [...shown.values()].map((c) => c.id))) : [];
  const worn = new Map<string, string[]>();
  for (const row of outfitRows) {
    const name = getAccessory(row.accessoryId)?.name;
    if (name) worn.set(row.creatureId, [...(worn.get(row.creatureId) ?? []), name]);
  }

  const mealsBy = new Map(mealCounts.map((r) => [r.userId, Number(r.count)]));
  const stepsBy = new Map(stepSums.map((r) => [r.userId, Number(r.total)]));
  const friendsBy = new Map<string, number>();
  for (const row of friendRows) {
    friendsBy.set(row.requesterId, (friendsBy.get(row.requesterId) ?? 0) + 1);
    friendsBy.set(row.addresseeId, (friendsBy.get(row.addresseeId) ?? 0) + 1);
  }
  const usernameOf = new Map(people.map((p) => [p.userId, p.username]));
  const awayAt = new Map<string, string>();
  const hosting = new Map<string, number>();
  for (const b of activeBoardings) {
    awayAt.set(b.ownerId, usernameOf.get(b.hostId) ?? "un ami");
    hosting.set(b.hostId, (hosting.get(b.hostId) ?? 0) + 1);
  }

  return people.map((p) => {
    const row = shown.get(p.userId) ?? null;
    return {
      userId: p.userId,
      username: p.username,
      friendCode: p.friendCode,
      email: p.email,
      createdAt: p.createdAt.toISOString(),
      creature: row ? toAdminCreature(row, now, gameRules, worn.get(row.id) ?? []) : null,
      creatureIsCurrent: row ? row.status !== "dead" : false,
      counts: { meals: mealsBy.get(p.userId) ?? 0, steps: stepsBy.get(p.userId) ?? 0, friends: friendsBy.get(p.userId) ?? 0, deadCreatures: dead.get(p.userId) ?? 0 },
      awayAt: awayAt.get(p.userId) ?? null,
      hosting: hosting.get(p.userId) ?? 0,
    };
  });
}

/** Case- and accent-insensitive match on username, email and creature name. */
export function matchesPlayer(player: AdminPlayer, query: string): boolean {
  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const q = fold(query.trim());
  if (!q) return true;
  return [player.username, player.email, player.friendCode, player.creature?.name ?? "", player.creature?.speciesName ?? ""].some((v) => fold(v).includes(q));
}
