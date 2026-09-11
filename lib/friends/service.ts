import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getOutfit, outfitToEquipped, type EquippedAccessory } from "@/lib/accessories/service";
import { DomainError } from "@/lib/api/errors";
import { toSpeciesSummary, getSpecies, type SpeciesSummary } from "@/lib/creatures";
import { tickCreature } from "@/lib/creatures/tick-service";
import { getDb } from "@/lib/db";
import { creatures, friendships, profiles, type Creature, type Profile } from "@/lib/db/schema";
import type { Rarity, StageId, Tier } from "@/lib/game/config";
import { deriveState, type CreatureState } from "@/lib/game/creature-view";
import { stageForXp } from "@/lib/game/growth";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
import { hatchProgress } from "@/lib/game/steps";
import { daysBetween } from "@/lib/game/time";
import { normalizeFriendCode } from "@/lib/profile/friend-code";

const MAX_PENDING_OUTGOING = 20;

export type PublicProfile = { userId: string; username: string };

/** Usernames of several users (a deleted profile reads "Un ami"). */
export async function publicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await getDb().select({ userId: profiles.userId, username: profiles.username }).from(profiles).where(inArray(profiles.userId, ids));
  const map = new Map(rows.map((p) => [p.userId, { userId: p.userId, username: p.username }]));
  for (const id of ids) if (!map.has(id)) map.set(id, { userId: id, username: "Un ami" });
  return map;
}

/** Exact lookup by friend code (any case / spacing) or by pseudo (case-insensitive). */
export async function findProfileByCodeOrUsername(query: string): Promise<Profile | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const db = getDb();
  const code = normalizeFriendCode(trimmed);
  if (code) {
    const byCode = await db.select().from(profiles).where(eq(profiles.friendCode, code)).limit(1);
    if (byCode[0]) return byCode[0];
  }
  const byName = await db
    .select()
    .from(profiles)
    .where(sql`lower(${profiles.username}) = lower(${trimmed})`)
    .limit(1);
  return byName[0] ?? null;
}

async function findPair(a: string, b: string) {
  const rows = await getDb()
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type RequestOutcome = { status: "requested" | "accepted"; friend: PublicProfile };

/**
 * Sends a friend request to the profile matching `query`. A reciprocal
 * pending request is accepted right away instead of creating a duplicate.
 */
export async function sendFriendRequest(userId: string, query: string): Promise<RequestOutcome> {
  const target = await findProfileByCodeOrUsername(query);
  if (!target) throw new DomainError("not_found", "Aucun joueur avec ce code ou ce pseudo.", 404);
  if (target.userId === userId) throw new DomainError("self", "C'est ton propre code !", 400);
  const friend = { userId: target.userId, username: target.username };
  const db = getDb();

  const existing = await findPair(userId, target.userId);
  if (existing) {
    if (existing.status === "accepted") throw new DomainError("already_friends", `${target.username} est déjà dans tes amis.`, 409);
    if (existing.requesterId === userId) throw new DomainError("already_requested", `Demande déjà envoyée à ${target.username}.`, 409);
    await db.update(friendships).set({ status: "accepted" }).where(eq(friendships.id, existing.id));
    return { status: "accepted", friend };
  }

  const [pending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(friendships)
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "pending")));
  if (Number(pending?.count ?? 0) >= MAX_PENDING_OUTGOING) {
    throw new DomainError("too_many_requests", "Trop de demandes en attente. Patiente un peu.", 429);
  }
  await db.insert(friendships).values({ requesterId: userId, addresseeId: target.userId, status: "pending" });
  return { status: "requested", friend };
}

/** Only the addressee can accept a pending request. */
export async function acceptFriendRequest(userId: string, friendshipId: string): Promise<void> {
  const updated = await getDb()
    .update(friendships)
    .set({ status: "accepted" })
    .where(and(eq(friendships.id, friendshipId), eq(friendships.addresseeId, userId), eq(friendships.status, "pending")))
    .returning({ id: friendships.id });
  if (updated.length === 0) throw new DomainError("not_found", "Demande introuvable.", 404);
}

/** Declines a pending request, cancels an outgoing one, or removes a friend. */
export async function removeFriendship(userId: string, friendshipId: string): Promise<void> {
  const deleted = await getDb()
    .delete(friendships)
    .where(and(eq(friendships.id, friendshipId), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
    .returning({ id: friendships.id });
  if (deleted.length === 0) throw new DomainError("not_found", "Lien introuvable.", 404);
}

/** The accepted friendship `friendshipId` seen from `userId`, or a 404 error. */
export async function getAcceptedFriend(userId: string, friendshipId: string): Promise<{ friendshipId: string; friend: PublicProfile }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.id, friendshipId), eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
    .limit(1);
  const row = rows[0];
  if (!row) throw new DomainError("not_found", "Cet ami est introuvable.", 404);
  const friendId = row.requesterId === userId ? row.addresseeId : row.requesterId;
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, friendId)).limit(1);
  if (!profile) throw new DomainError("not_found", "Cet ami est introuvable.", 404);
  return { friendshipId: row.id, friend: { userId: profile.userId, username: profile.username } };
}

export type FriendRequestView = { id: string; user: PublicProfile; createdAt: string };

export async function listRequests(userId: string): Promise<{ incoming: FriendRequestView[]; outgoing: FriendRequestView[] }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.status, "pending"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
    .orderBy(desc(friendships.createdAt));
  const otherIds = [...new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)))];
  const people = otherIds.length ? await db.select().from(profiles).where(inArray(profiles.userId, otherIds)) : [];
  const byId = new Map(people.map((p) => [p.userId, { userId: p.userId, username: p.username }]));
  const view = (r: (typeof rows)[number], other: string): FriendRequestView | null => {
    const user = byId.get(other);
    return user ? { id: r.id, user, createdAt: r.createdAt.toISOString() } : null;
  };
  return {
    incoming: rows.filter((r) => r.addresseeId === userId).map((r) => view(r, r.requesterId)).filter((v): v is FriendRequestView => v !== null),
    outgoing: rows.filter((r) => r.requesterId === userId).map((r) => view(r, r.addresseeId)).filter((v): v is FriendRequestView => v !== null),
  };
}

export async function countIncomingRequests(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(friendships)
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")));
  return Number(row?.count ?? 0);
}

/** What a friend is allowed to see about someone's creature (no photos, no stats details). */
export type FriendCreatureView =
  | { status: "none" }
  | { status: "egg"; tier: Tier; hatchProgress: number }
  | {
      status: "alive";
      tier: Tier;
      name: string | null;
      species: SpeciesSummary | null;
      rarity: Rarity | null;
      stage: StageId;
      state: CreatureState;
      health: number;
      ageDays: number;
      accessories: EquippedAccessory[];
    }
  | { status: "dead"; tier: Tier; name: string | null; species: SpeciesSummary | null; rarity: Rarity | null; lifespanDays: number | null };

export type FriendView = { friendshipId: string; user: PublicProfile; since: string; creature: FriendCreatureView };

async function creatureViewFor(creature: Creature | null, rules: GameRules, now: Date): Promise<FriendCreatureView> {
  if (!creature) return { status: "none" };
  const tier = creature.tier as Tier;
  const species = creature.speciesId ? getSpecies(creature.speciesId) : undefined;
  if (creature.status === "egg") return { status: "egg", tier, hatchProgress: hatchProgress(creature.eggSteps, tier, rules) };
  if (creature.status === "dead") {
    return { status: "dead", tier, name: creature.name, species: species ? toSpeciesSummary(species) : null, rarity: creature.rarity as Rarity | null, lifespanDays: creature.lifespanDays };
  }
  const outfit = await getOutfit(creature.id);
  return {
    status: "alive",
    tier,
    name: creature.name,
    species: species ? toSpeciesSummary(species) : null,
    rarity: creature.rarity as Rarity | null,
    stage: stageForXp(creature.xp).id,
    state: deriveState(creature),
    health: Math.round(creature.health),
    ageDays: creature.hatchedAt ? daysBetween(creature.hatchedAt, now) : 0,
    accessories: outfitToEquipped(outfit),
  };
}

/** Accepted friends with their current creature, sorted by health (healthiest first). */
export async function listFriends(userId: string, now: Date = new Date()): Promise<FriendView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))));
  if (rows.length === 0) return [];
  const friendIds = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  const [people, rules] = await Promise.all([db.select().from(profiles).where(inArray(profiles.userId, friendIds)), getGameRules()]);
  const byId = new Map(people.map((p) => [p.userId, p]));

  // Latest creature of each friend: the active one if any, otherwise the most recent dead one.
  const allCreatures = await db
    .select()
    .from(creatures)
    .where(inArray(creatures.userId, friendIds))
    .orderBy(desc(creatures.createdAt));
  const latest = new Map<string, Creature>();
  for (const c of allCreatures) {
    const current = latest.get(c.userId);
    if (!current) latest.set(c.userId, c);
    else if (current.status === "dead" && c.status !== "dead") latest.set(c.userId, c);
  }

  const views: FriendView[] = [];
  for (const row of rows) {
    const friendId = row.requesterId === userId ? row.addresseeId : row.requesterId;
    const profile = byId.get(friendId);
    if (!profile) continue;
    let creature = latest.get(friendId) ?? null;
    if (creature?.status === "alive") creature = await tickCreature(creature, now, rules);
    views.push({
      friendshipId: row.id,
      user: { userId: profile.userId, username: profile.username },
      since: row.createdAt.toISOString(),
      creature: await creatureViewFor(creature, rules, now),
    });
  }

  const rank = (v: FriendView) => (v.creature.status === "alive" ? 0 : v.creature.status === "egg" ? 1 : v.creature.status === "dead" ? 2 : 3);
  return views.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.creature.status === "alive" && b.creature.status === "alive") return b.creature.health - a.creature.health;
    return a.user.username.localeCompare(b.user.username, "fr");
  });
}
