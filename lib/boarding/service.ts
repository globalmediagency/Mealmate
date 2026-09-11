import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { applyStepGains, getActiveCreatureTicked, refreshEggSteps } from "@/lib/creatures/service";
import { tickCreature } from "@/lib/creatures/tick-service";
import { getDb } from "@/lib/db";
import { boardings, creatures, profiles, type Boarding, type Creature } from "@/lib/db/schema";
import { getAcceptedFriend, type PublicProfile } from "@/lib/friends/service";
import { BOARDING } from "@/lib/game/config";
import type { GameRules } from "@/lib/game/rules";
import { getGameRules } from "@/lib/game/rules-service";
import { gameDate } from "@/lib/game/time";
import { saveManualSteps, type SaveStepsMode, type SaveStepsResult } from "@/lib/steps/service";
import { daysLeft } from "./custody";

const DAY_MS = 86_400_000;

/** A creature the user currently takes care of: their own, or one a friend entrusted to them. */
export type HeldCreature = {
  creature: Creature;
  /** Open stay when the creature belongs to a friend, null for the user's own creature. */
  boarding: Boarding | null;
  /** The owner, for a boarded creature. */
  owner: PublicProfile | null;
};

export type HeldCreatures = {
  /** The user's own egg or creature (possibly away at a friend's), null when none. */
  own: Creature | null;
  /** Open stay of the own creature at a friend's: the creature is not at home. */
  away: (Boarding & { host: PublicProfile }) | null;
  /** Living creatures friends entrusted to the user, oldest stay first. */
  boarded: Array<HeldCreature & { boarding: Boarding; owner: PublicProfile }>;
};

export type BoardingView = {
  id: string;
  creatureId: string;
  startedAt: string;
  endsAt: string;
  daysLeft: number;
  /** The host has not opened the notice yet. */
  seen: boolean;
};

export function toBoardingView(boarding: Boarding, now: Date = new Date()): BoardingView {
  return {
    id: boarding.id,
    creatureId: boarding.creatureId,
    startedAt: boarding.startedAt.toISOString(),
    endsAt: boarding.endsAt.toISOString(),
    daysLeft: daysLeft(boarding.endsAt, now),
    seen: boarding.hostSeenAt !== null,
  };
}

async function profilesOf(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await getDb().select().from(profiles).where(inArray(profiles.userId, ids));
  const map = new Map(rows.map((p) => [p.userId, { userId: p.userId, username: p.username }]));
  for (const id of ids) if (!map.has(id)) map.set(id, { userId: id, username: "Un ami" });
  return map;
}

async function profileOf(userId: string): Promise<PublicProfile> {
  return (await profilesOf([userId])).get(userId)!;
}

export async function openBoardingOfCreature(creatureId: string): Promise<Boarding | null> {
  const rows = await getDb().select().from(boardings).where(and(eq(boardings.creatureId, creatureId), isNull(boardings.endedAt))).limit(1);
  return rows[0] ?? null;
}

export async function openBoardingsHostedBy(hostId: string): Promise<Boarding[]> {
  return getDb().select().from(boardings).where(and(eq(boardings.hostId, hostId), isNull(boardings.endedAt))).orderBy(asc(boardings.startedAt));
}

type EndReason = NonNullable<Boarding["endReason"]>;

/** Closes an open stay at most once (conditional update). Returns null when it was already closed. */
async function closeBoarding(id: string, endedAt: Date, reason: EndReason): Promise<Boarding | null> {
  const rows = await getDb()
    .update(boardings)
    .set({ endedAt, endReason: reason })
    .where(and(eq(boardings.id, id), isNull(boardings.endedAt)))
    .returning();
  return rows[0] ?? null;
}

async function readBoarding(id: string): Promise<Boarding | null> {
  const rows = await getDb().select().from(boardings).where(eq(boardings.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Lazy end of a stay: a creature that died goes home dead, a stay past its
 * term ends on its own. Returns the stored row (closed or still open).
 */
export async function settleBoarding(boarding: Boarding, creature: Creature, now: Date): Promise<Boarding> {
  if (boarding.endedAt) return boarding;
  if (creature.status !== "alive") return (await closeBoarding(boarding.id, creature.diedAt ?? now, "died")) ?? (await readBoarding(boarding.id)) ?? boarding;
  if (boarding.endsAt.getTime() <= now.getTime()) return (await closeBoarding(boarding.id, boarding.endsAt, "expired")) ?? (await readBoarding(boarding.id)) ?? boarding;
  return boarding;
}

/** Everything the user takes care of right now (own creature ticked, boarded ones ticked and settled). */
export async function getHeldCreatures(userId: string, now: Date = new Date(), rules?: GameRules): Promise<HeldCreatures> {
  const gameRules = rules ?? (await getGameRules());
  const own = await getActiveCreatureTicked(userId, now, gameRules);
  let away: HeldCreatures["away"] = null;
  if (own && own.status !== "egg") {
    const open = await openBoardingOfCreature(own.id);
    if (open) {
      const settled = await settleBoarding(open, own, now);
      if (!settled.endedAt) away = { ...settled, host: await profileOf(settled.hostId) };
    }
  }

  const open = await openBoardingsHostedBy(userId);
  const boarded: HeldCreatures["boarded"] = [];
  if (open.length > 0) {
    const db = getDb();
    const rows = await db.select().from(creatures).where(inArray(creatures.id, open.map((b) => b.creatureId)));
    const byId = new Map(rows.map((c) => [c.id, c]));
    const owners = await profilesOf(open.map((b) => b.ownerId));
    for (const boarding of open) {
      let creature = byId.get(boarding.creatureId);
      if (!creature) continue;
      if (creature.status === "alive") creature = await tickCreature(creature, now, gameRules);
      const settled = await settleBoarding(boarding, creature, now);
      if (settled.endedAt) continue;
      boarded.push({ creature, boarding: settled, owner: owners.get(boarding.ownerId)! });
    }
  }
  return { own, away, boarded };
}

/** Living creatures the user feeds, walks with and can play with: their own (when home) first, then the boarded ones. */
export function livingHeld(held: HeldCreatures): HeldCreature[] {
  const list: HeldCreature[] = [];
  if (held.own && held.own.status === "alive" && !held.away) list.push({ creature: held.own, boarding: null, owner: null });
  return list.concat(held.boarded);
}

export type HeldStepsResult = SaveStepsResult & {
  /** The user's own creature after the update (null when none, or away at a friend's). */
  own: Creature | null;
  /** Living creatures credited (own when home + boarded ones). */
  credited: number;
};

/**
 * Saves today's manual steps and converts the new thousands into effects for
 * every living creature in the user's care; an egg counts them for hatching.
 */
export async function saveStepsForHeld(userId: string, rawSteps: number, mode: SaveStepsMode, today = gameDate(), now: Date = new Date(), rules?: GameRules): Promise<HeldStepsResult> {
  const held = await getHeldCreatures(userId, now, rules);
  const living = livingHeld(held);
  const result = await saveManualSteps(userId, rawSteps, living[0]?.creature ?? null, today, mode);
  let own = held.own;
  if (own?.status === "egg") own = await refreshEggSteps(own);
  for (const h of living) {
    const next = await applyStepGains(h.creature, result.gains);
    if (own && h.creature.id === own.id) own = next;
  }
  return { ...result, own: held.away ? null : own, credited: living.length };
}

const awayError = (creature: Creature, host: PublicProfile) =>
  new DomainError("creature_boarded", `${creature.name ?? "Ta créature"} est en pension chez ${host.username} : c'est ${host.username} qui s'en occupe pour le moment.`, 409);

/**
 * One creature the user takes care of: their own (default) or, with an id,
 * one entrusted to them. The own creature away at a friend's is refused.
 */
export async function getHeldCreature(userId: string, creatureId: string | null | undefined, now: Date = new Date(), rules?: GameRules): Promise<HeldCreature> {
  const held = await getHeldCreatures(userId, now, rules);
  if (!creatureId || held.own?.id === creatureId) {
    if (!held.own) throw new DomainError("no_creature", "Tu n'as pas de créature pour le moment.", 409);
    if (held.away) throw awayError(held.own, held.away.host);
    return { creature: held.own, boarding: null, owner: null };
  }
  const boarded = held.boarded.find((h) => h.creature.id === creatureId);
  if (!boarded) throw new DomainError("not_found", "Cette créature n'est pas chez toi.", 404);
  return boarded;
}

/** The own creature's open stay, with the host, for the owner's screens (settled first). */
export async function getAwayStatus(userId: string, now: Date = new Date(), rules?: GameRules): Promise<HeldCreatures["away"]> {
  return (await getHeldCreatures(userId, now, rules)).away;
}

export type StartBoardingOutcome = { boarding: Boarding; creature: Creature; friend: PublicProfile };

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505";
}

/**
 * Entrusts the user's living, named creature to an accepted friend for
 * `days` days (1–30). No acceptance needed: the friend is told on their home
 * screen and the owner can take the creature back at any time.
 */
export async function startBoarding(userId: string, friendshipId: string, days: number, now: Date = new Date()): Promise<StartBoardingOutcome> {
  if (!Number.isInteger(days) || days < 1 || days > BOARDING.maxDays) {
    throw new DomainError("validation_error", `La pension dure entre 1 et ${BOARDING.maxDays} jours.`, 400);
  }
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  const held = await getHeldCreatures(userId, now);
  const creature = held.own;
  if (!creature || creature.status !== "alive" || !creature.name) {
    throw new DomainError("no_creature", "Il te faut une créature vivante, avec un prénom, pour la confier.", 409);
  }
  if (held.away) throw new DomainError("already_boarded", `${creature.name} est déjà en pension chez ${held.away.host.username}.`, 409);

  const hosting = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(boardings)
    .where(and(eq(boardings.hostId, friend.userId), isNull(boardings.endedAt), gt(boardings.endsAt, now)));
  if (Number(hosting[0]?.count ?? 0) >= BOARDING.maxPerHost) {
    throw new DomainError("host_full", `${friend.username} héberge déjà ${BOARDING.maxPerHost} créatures : c'est complet chez ${friend.username}.`, 409);
  }

  try {
    const [boarding] = await getDb()
      .insert(boardings)
      .values({ creatureId: creature.id, ownerId: userId, hostId: friend.userId, startedAt: now, endsAt: new Date(now.getTime() + days * DAY_MS) })
      .returning();
    return { boarding, creature, friend };
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("already_boarded", `${creature.name} est déjà en pension.`, 409);
    throw error;
  }
}

export type EndBoardingOutcome = {
  boarding: Boarding;
  creature: Creature;
  /** Who ended it: the owner takes the creature back, the host sends it home. */
  role: "owner" | "host";
  /** The other party. */
  other: PublicProfile;
};

/**
 * Ends a stay now: the owner takes their creature back (dead or alive), or
 * the host sends it home early. Already-ended stays are returned as they are.
 */
export async function endBoarding(userId: string, boardingId: string, now: Date = new Date(), rules?: GameRules): Promise<EndBoardingOutcome> {
  const boarding = await readBoarding(boardingId);
  if (!boarding || (boarding.ownerId !== userId && boarding.hostId !== userId)) throw new DomainError("not_found", "Pension introuvable.", 404);
  const role = boarding.ownerId === userId ? "owner" : "host";
  const other = await profileOf(role === "owner" ? boarding.hostId : boarding.ownerId);
  const rows = await getDb().select().from(creatures).where(eq(creatures.id, boarding.creatureId)).limit(1);
  let creature = rows[0];
  if (!creature) throw new DomainError("not_found", "Cette créature n'existe plus.", 404);
  if (creature.status === "alive") creature = await tickCreature(creature, now, rules ?? (await getGameRules()));
  const settled = await settleBoarding(boarding, creature, now);
  if (settled.endedAt) return { boarding: settled, creature, role, other };
  const closed = (await closeBoarding(boarding.id, now, role === "owner" ? "recovered" : "returned")) ?? (await readBoarding(boarding.id)) ?? settled;
  return { boarding: closed, creature, role, other };
}

/** Open stays the host has not looked at yet (badge on the creature tab). */
export async function countUnseenBoardings(hostId: string, now: Date = new Date()): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(boardings)
    .where(and(eq(boardings.hostId, hostId), isNull(boardings.endedAt), isNull(boardings.hostSeenAt), gt(boardings.endsAt, now)));
  return Number(row?.count ?? 0);
}

export async function markBoardingsSeen(hostId: string, now: Date = new Date()): Promise<void> {
  await getDb().update(boardings).set({ hostSeenAt: now }).where(and(eq(boardings.hostId, hostId), isNull(boardings.endedAt), isNull(boardings.hostSeenAt)));
}

/** Every stay the user took part in, for the account export. */
export async function listBoardingsOf(userId: string): Promise<Boarding[]> {
  return getDb()
    .select()
    .from(boardings)
    .where(or(eq(boardings.ownerId, userId), eq(boardings.hostId, userId)))
    .orderBy(asc(boardings.startedAt));
}
