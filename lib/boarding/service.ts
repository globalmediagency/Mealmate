import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { DomainError } from "@/lib/api/errors";
import { applyStepGains, getActiveCreatureTicked, refreshEggSteps } from "@/lib/creatures/service";
import { tickCreature } from "@/lib/creatures/tick-service";
import { getDb } from "@/lib/db";
import { boardings, creatures, profiles, type Boarding, type Creature } from "@/lib/db/schema";
import { getAcceptedFriend, type PublicProfile } from "@/lib/friends/service";
import { BOARDING, type Tier } from "@/lib/game/config";
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
  /** Active stay of the own creature at a friend's: the creature is not at home. */
  away: (Boarding & { host: PublicProfile }) | null;
  /** Proposal sent for the own creature, waiting for the friend's answer (the creature stays home meanwhile). */
  proposal: (Boarding & { host: PublicProfile }) | null;
  /** Living creatures friends entrusted to the user, oldest stay first. */
  boarded: Array<HeldCreature & { boarding: Boarding; owner: PublicProfile }>;
};

export type BoardingView = {
  id: string;
  creatureId: string;
  status: Boarding["status"];
  startedAt: string;
  endsAt: string;
  daysLeft: number;
  /** Requested length of the stay, in days. */
  days: number;
  /** The host has not opened the notice yet. */
  seen: boolean;
};

const durationDays = (boarding: Pick<Boarding, "startedAt" | "endsAt">) => Math.max(1, Math.round((boarding.endsAt.getTime() - boarding.startedAt.getTime()) / DAY_MS));

export function toBoardingView(boarding: Boarding, now: Date = new Date()): BoardingView {
  return {
    id: boarding.id,
    creatureId: boarding.creatureId,
    status: boarding.status,
    startedAt: boarding.startedAt.toISOString(),
    endsAt: boarding.endsAt.toISOString(),
    daysLeft: daysLeft(boarding.endsAt, now),
    days: durationDays(boarding),
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

/** Active stays at the host's (proposals excluded). */
export async function openBoardingsHostedBy(hostId: string): Promise<Boarding[]> {
  return getDb()
    .select()
    .from(boardings)
    .where(and(eq(boardings.hostId, hostId), isNull(boardings.endedAt), eq(boardings.status, "active")))
    .orderBy(asc(boardings.startedAt));
}

type EndReason = NonNullable<Boarding["endReason"]>;

/**
 * Closes an open stay at most once (conditional update). Returns null when it
 * was already closed. A death resets `host_seen_at`: the host gets a notice
 * to acknowledge, like the arrival.
 */
async function closeBoarding(id: string, endedAt: Date, reason: EndReason): Promise<Boarding | null> {
  const rows = await getDb()
    .update(boardings)
    .set({
      endedAt,
      endReason: reason,
      status: "ended",
      ...(reason === "died" ? { hostSeenAt: null } : {}),
      // The owner is told when the host declines or sends the creature home early.
      ...(reason === "declined" || reason === "returned" ? { ownerSeenAt: null } : {}),
    })
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
  if (boarding.status === "pending") {
    // A proposal for a creature that died meanwhile is void; otherwise it waits for the host.
    if (creature.status !== "alive") return (await closeBoarding(boarding.id, now, "cancelled")) ?? (await readBoarding(boarding.id)) ?? boarding;
    return boarding;
  }
  if (creature.status !== "alive") return (await closeBoarding(boarding.id, creature.diedAt ?? now, "died")) ?? (await readBoarding(boarding.id)) ?? boarding;
  if (boarding.endsAt.getTime() <= now.getTime()) return (await closeBoarding(boarding.id, boarding.endsAt, "expired")) ?? (await readBoarding(boarding.id)) ?? boarding;
  return boarding;
}

/** Everything the user takes care of right now (own creature ticked, boarded ones ticked and settled). */
export async function getHeldCreatures(userId: string, now: Date = new Date(), rules?: GameRules): Promise<HeldCreatures> {
  const gameRules = rules ?? (await getGameRules());
  const own = await getActiveCreatureTicked(userId, now, gameRules);
  let away: HeldCreatures["away"] = null;
  let proposal: HeldCreatures["proposal"] = null;
  if (!own) {
    // A stay left open on a creature that died (death registered by another read): close it now.
    const stale = await getDb()
      .select({ boarding: boardings, creature: creatures })
      .from(boardings)
      .innerJoin(creatures, eq(creatures.id, boardings.creatureId))
      .where(and(eq(boardings.ownerId, userId), isNull(boardings.endedAt), eq(creatures.status, "dead")));
    for (const row of stale) await settleBoarding(row.boarding, row.creature, now);
  }
  if (own && own.status !== "egg") {
    const open = await openBoardingOfCreature(own.id);
    if (open) {
      const settled = await settleBoarding(open, own, now);
      if (!settled.endedAt) {
        const withHost = { ...settled, host: await profileOf(settled.hostId) };
        if (settled.status === "active") away = withHost;
        else proposal = withHost;
      }
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
  return { own, away, proposal, boarded };
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

/** What the owner may choose for a creature of this tier under the current rules. */
export type BoardingLimits = { maxDays: number; durations: number[] };

export function boardingLimits(tier: Tier, rules: GameRules): BoardingLimits {
  const maxDays = Math.max(1, Math.floor(rules.tiers[tier].boardingMaxDays));
  const durations: number[] = BOARDING.durations.filter((d) => d < maxDays);
  durations.push(maxDays);
  return { maxDays, durations };
}

/** Instant after which a stay that lasted `effectiveMs` no longer blocks the owner (null when there is no wait). */
export function cooldownEnd(startedAt: Date, endedAt: Date, multiplier: number): Date | null {
  const effectiveMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
  const waitMs = effectiveMs * Math.max(0, multiplier);
  return waitMs > 0 ? new Date(endedAt.getTime() + waitMs) : null;
}

/**
 * When the owner may lend a creature again: after a stay of X days they wait
 * X × `rules.boarding.cooldownMultiplier`, whatever the creature. A stay that
 * ended with the creature's death never counts. Null when nothing blocks
 * them now.
 */
export async function boardingCooldownUntil(ownerId: string, now: Date, rules: GameRules): Promise<Date | null> {
  if (rules.boarding.cooldownMultiplier <= 0) return null;
  // A stay of a creature that has died since never counts, whatever reason closed it (the death may have been registered after the closing).
  const rows = await getDb()
    .select({ startedAt: boardings.startedAt, endedAt: boardings.endedAt })
    .from(boardings)
    .innerJoin(creatures, eq(creatures.id, boardings.creatureId))
    .where(and(eq(boardings.ownerId, ownerId), isNotNull(boardings.endedAt), sql`${boardings.endReason} NOT IN ('died', 'declined', 'cancelled')`, sql`${creatures.status} <> 'dead'`))
    .orderBy(desc(boardings.endedAt))
    .limit(1);
  const last = rows[0];
  if (!last?.endedAt) return null;
  const until = cooldownEnd(last.startedAt, last.endedAt, rules.boarding.cooldownMultiplier);
  return until && until.getTime() > now.getTime() ? until : null;
}

export type StartBoardingOutcome = { boarding: Boarding; creature: Creature; friend: PublicProfile };

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null)?.code ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505";
}

const formatDay = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

/**
 * Proposes the user's living, named creature to an accepted friend for
 * `days` days (1 to the tier's maximum, admin rule). The creature stays home
 * until the friend accepts (`respondToBoarding`); the owner can withdraw the
 * proposal meanwhile. Admin rules also cap how many creatures the friend
 * hosts (checked again on acceptance) and impose a wait after the owner's
 * previous stay.
 */
export async function startBoarding(userId: string, friendshipId: string, days: number, now: Date = new Date(), rules?: GameRules): Promise<StartBoardingOutcome> {
  const gameRules = rules ?? (await getGameRules());
  if (!Number.isInteger(days) || days < 1 || days > BOARDING.absoluteMaxDays) {
    throw new DomainError("validation_error", `La pension dure entre 1 et ${BOARDING.absoluteMaxDays} jours.`, 400);
  }
  const { friend } = await getAcceptedFriend(userId, friendshipId);
  const held = await getHeldCreatures(userId, now, gameRules);
  const creature = held.own;
  if (!creature || creature.status !== "alive" || !creature.name) {
    throw new DomainError("no_creature", "Il te faut une créature vivante, avec un prénom, pour la confier.", 409);
  }
  if (held.away) throw new DomainError("already_boarded", `${creature.name} est déjà en pension chez ${held.away.host.username}.`, 409);
  if (held.proposal) throw new DomainError("already_boarded", `Une proposition pour ${creature.name} attend déjà la réponse de ${held.proposal.host.username}.`, 409);
  const { maxDays } = boardingLimits(creature.tier as Tier, gameRules);
  if (days > maxDays) {
    throw new DomainError("validation_error", `Une créature de ce niveau peut être confiée ${maxDays} jour${maxDays > 1 ? "s" : ""} au plus.`, 400);
  }
  const cooldown = await boardingCooldownUntil(userId, now, gameRules);
  if (cooldown) {
    throw new DomainError("boarding_cooldown", `Après une pension, il faut souffler un peu : tu pourras confier ${creature.name} à nouveau à partir du ${formatDay(cooldown)}.`, 409);
  }

  await assertHostHasRoom(friend, now, gameRules);

  try {
    const [boarding] = await getDb()
      .insert(boardings)
      .values({ creatureId: creature.id, ownerId: userId, hostId: friend.userId, status: "pending", startedAt: now, endsAt: new Date(now.getTime() + days * DAY_MS), ownerSeenAt: now })
      .returning();
    return { boarding, creature, friend };
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("already_boarded", `${creature.name} est déjà en pension ou proposée.`, 409);
    throw error;
  }
}

/** Active stays only count against the host's capacity (admin rule); 0 disables boarding. */
async function assertHostHasRoom(host: PublicProfile, now: Date, rules: GameRules): Promise<void> {
  const maxPerHost = rules.boarding.maxPerHost;
  const hosting = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(boardings)
    .where(and(eq(boardings.hostId, host.userId), isNull(boardings.endedAt), eq(boardings.status, "active"), gt(boardings.endsAt, now)));
  if (Number(hosting[0]?.count ?? 0) >= maxPerHost) {
    throw new DomainError(
      "host_full",
      maxPerHost === 0 ? "La pension est désactivée pour le moment." : `${host.username} héberge déjà ${maxPerHost} créature${maxPerHost > 1 ? "s" : ""} : c'est complet chez ${host.username}.`,
      409,
    );
  }
}

export type RespondOutcome = { boarding: Boarding; creature: Creature; owner: PublicProfile; accepted: boolean };

/**
 * The friend accepts or declines a boarding proposal. Acceptance starts the
 * stay now (the agreed length runs from this instant) after checking the
 * creature is still alive at home and the host still has room.
 */
export async function respondToBoarding(hostId: string, boardingId: string, accept: boolean, now: Date = new Date(), rules?: GameRules): Promise<RespondOutcome> {
  const boarding = await readBoarding(boardingId);
  if (!boarding || boarding.hostId !== hostId || boarding.status !== "pending" || boarding.endedAt) throw new DomainError("not_found", "Proposition introuvable ou déjà traitée.", 404);
  const gameRules = rules ?? (await getGameRules());
  const owner = await profileOf(boarding.ownerId);
  const rows = await getDb().select().from(creatures).where(eq(creatures.id, boarding.creatureId)).limit(1);
  let creature = rows[0];
  if (!creature) throw new DomainError("not_found", "Cette créature n'existe plus.", 404);
  if (creature.status === "alive") creature = await tickCreature(creature, now, gameRules);
  if (!accept) {
    const closed = (await closeBoarding(boarding.id, now, "declined")) ?? (await readBoarding(boarding.id)) ?? boarding;
    return { boarding: closed, creature, owner, accepted: false };
  }
  if (creature.status !== "alive") {
    await closeBoarding(boarding.id, now, "cancelled");
    throw new DomainError("no_creature", `${creature.name ?? "La créature"} de ${owner.username} n'est plus là… la proposition est annulée.`, 409);
  }
  await assertHostHasRoom({ userId: hostId, username: "toi" }, now, gameRules);
  const days = durationDays(boarding);
  const started = await getDb()
    .update(boardings)
    .set({ status: "active", startedAt: now, endsAt: new Date(now.getTime() + days * DAY_MS), hostSeenAt: now, ownerSeenAt: null })
    .where(and(eq(boardings.id, boarding.id), eq(boardings.status, "pending"), isNull(boardings.endedAt)))
    .returning();
  if (!started[0]) throw new DomainError("not_found", "Proposition déjà traitée.", 409);
  return { boarding: started[0], creature, owner, accepted: true };
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
  // A pending proposal is withdrawn by the owner or declined by the host.
  const reason: EndReason = settled.status === "pending" ? (role === "owner" ? "cancelled" : "declined") : role === "owner" ? "recovered" : "returned";
  const closed = (await closeBoarding(boarding.id, now, reason)) ?? (await readBoarding(boarding.id)) ?? settled;
  return { boarding: closed, creature, role, other };
}

/** Proposals waiting for the host + deaths not acknowledged yet (badge on the creature tab). */
export async function countUnseenBoardings(hostId: string, now: Date = new Date()): Promise<number> {
  void now;
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(boardings)
    .where(
      and(
        eq(boardings.hostId, hostId),
        or(and(isNull(boardings.endedAt), eq(boardings.status, "pending")), and(eq(boardings.endReason, "died"), isNull(boardings.hostSeenAt))),
      ),
    );
  return Number(row?.count ?? 0);
}

/** The host dismissed the notice of one stay (a death in their care); without an id, every open stay. */
export async function markBoardingsSeen(hostId: string, now: Date = new Date(), boardingId?: string): Promise<void> {
  const target = boardingId ? eq(boardings.id, boardingId) : isNull(boardings.endedAt);
  await getDb().update(boardings).set({ hostSeenAt: now }).where(and(eq(boardings.hostId, hostId), isNull(boardings.hostSeenAt), target));
}

export type BoardingProposalView = { boarding: BoardingView; creature: Creature; owner: PublicProfile };

/** Proposals a friend sent to the host, waiting for an answer (void ones are settled away). */
export async function listProposalsFor(hostId: string, now: Date = new Date(), rules?: GameRules): Promise<BoardingProposalView[]> {
  const rows = await getDb()
    .select()
    .from(boardings)
    .where(and(eq(boardings.hostId, hostId), isNull(boardings.endedAt), eq(boardings.status, "pending")))
    .orderBy(asc(boardings.startedAt));
  if (rows.length === 0) return [];
  const gameRules = rules ?? (await getGameRules());
  const db = getDb();
  const list = await db.select().from(creatures).where(inArray(creatures.id, rows.map((b) => b.creatureId)));
  const byId = new Map(list.map((c) => [c.id, c]));
  const owners = await profilesOf(rows.map((b) => b.ownerId));
  const out: BoardingProposalView[] = [];
  for (const boarding of rows) {
    let creature = byId.get(boarding.creatureId);
    if (!creature) continue;
    if (creature.status === "alive") creature = await tickCreature(creature, now, gameRules);
    const settled = await settleBoarding(boarding, creature, now);
    if (settled.endedAt) continue;
    out.push({ boarding: toBoardingView(settled, now), creature, owner: owners.get(boarding.ownerId)! });
  }
  return out;
}

export type OwnerNoticeView = { boarding: BoardingView; host: PublicProfile; creatureName: string | null; kind: "accepted" | "declined" | "returned" };

/** Answers and early returns the owner has not seen yet. */
export async function listOwnerNotices(ownerId: string, now: Date = new Date()): Promise<OwnerNoticeView[]> {
  const rows = await getDb()
    .select({ boarding: boardings, creatureName: creatures.name })
    .from(boardings)
    .innerJoin(creatures, eq(creatures.id, boardings.creatureId))
    .where(and(eq(boardings.ownerId, ownerId), isNull(boardings.ownerSeenAt), or(eq(boardings.status, "active"), inArray(boardings.endReason, ["declined", "returned"]))))
    .orderBy(desc(boardings.startedAt))
    .limit(5);
  if (rows.length === 0) return [];
  const hosts = await profilesOf(rows.map((r) => r.boarding.hostId));
  return rows.map((r) => ({
    boarding: toBoardingView(r.boarding, now),
    host: hosts.get(r.boarding.hostId)!,
    creatureName: r.creatureName,
    kind: r.boarding.status === "active" ? "accepted" : r.boarding.endReason === "declined" ? "declined" : "returned",
  }));
}

export async function countOwnerNotices(ownerId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(boardings)
    .where(and(eq(boardings.ownerId, ownerId), isNull(boardings.ownerSeenAt), or(eq(boardings.status, "active"), inArray(boardings.endReason, ["declined", "returned"]))));
  return Number(row?.count ?? 0);
}

export async function markOwnerNoticesSeen(ownerId: string, now: Date = new Date()): Promise<void> {
  await getDb().update(boardings).set({ ownerSeenAt: now }).where(and(eq(boardings.ownerId, ownerId), isNull(boardings.ownerSeenAt)));
}

export type HostedDeathView = { boardingId: string; creatureName: string | null; ownerName: string; diedAt: string };

/** Creatures that died in the host's care and whose notice was not dismissed yet. */
export async function listUnseenDeathsHosted(hostId: string): Promise<HostedDeathView[]> {
  const rows = await getDb()
    .select({ id: boardings.id, ownerId: boardings.ownerId, endedAt: boardings.endedAt, creatureName: creatures.name })
    .from(boardings)
    .innerJoin(creatures, eq(creatures.id, boardings.creatureId))
    .where(and(eq(boardings.hostId, hostId), eq(boardings.endReason, "died"), isNull(boardings.hostSeenAt)))
    .orderBy(desc(boardings.endedAt));
  if (rows.length === 0) return [];
  const owners = await profilesOf(rows.map((r) => r.ownerId));
  return rows.map((r) => ({ boardingId: r.id, creatureName: r.creatureName, ownerName: owners.get(r.ownerId)!.username, diedAt: (r.endedAt ?? new Date()).toISOString() }));
}

/** The host a creature was staying with when it died, for the owner's mourning screen. */
export async function diedInBoarding(creatureId: string): Promise<PublicProfile | null> {
  const rows = await getDb()
    .select({ hostId: boardings.hostId })
    .from(boardings)
    .where(and(eq(boardings.creatureId, creatureId), eq(boardings.endReason, "died")))
    .limit(1);
  return rows[0] ? profileOf(rows[0].hostId) : null;
}

/** Every stay the user took part in, for the account export. */
export async function listBoardingsOf(userId: string): Promise<Boarding[]> {
  return getDb()
    .select()
    .from(boardings)
    .where(or(eq(boardings.ownerId, userId), eq(boardings.hostId, userId)))
    .orderBy(asc(boardings.startedAt));
}
