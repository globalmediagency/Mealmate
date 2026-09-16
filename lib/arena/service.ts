/**
 * "Arène" (spec § 3.22): a short battle between accepted friends, each one
 * looking at the table through their own phone. The server is the referee
 * (health, bonuses, ranking, rewards); the phones judge the geometry (where
 * an egg lands, what the tongue sweeps) because only their camera knows
 * where the markers are. Everything time-based is applied lazily on read.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { ArCreature } from "@/components/ar/types";
import { getOutfit, outfitToEquipped } from "@/lib/accessories/service";
import { DomainError } from "@/lib/api/errors";
import { ensureCreatureMarker } from "@/lib/ar/service";
import { getHeldCreature } from "@/lib/boarding/service";
import { tickCreature } from "@/lib/creatures/tick-service";
import { getDb } from "@/lib/db";
import {
  arenaBonuses,
  arenaEvents,
  arenaMatches,
  arenaPlayers,
  creatures,
  type ArenaBonus,
  type ArenaEvent,
  type ArenaMatch,
  type ArenaPlayer,
  type Creature,
} from "@/lib/db/schema";
import { acceptedFriendIds, publicProfiles } from "@/lib/friends/service";
import { arenaScore, arenaSecondsLeft, placeArenaBonus, rankArenaPlayers } from "@/lib/game/arena";
import { ARENA } from "@/lib/game/config";
import { deriveState } from "@/lib/game/creature-view";
import { stageForXp } from "@/lib/game/growth";
import type { PlayEffects } from "@/lib/game/play";
import type { GameRules } from "@/lib/game/rules";
import { countPlaysToday, recordPlay } from "@/lib/play/service";
import { gameDate } from "@/lib/game/time";

const MINUTE_MS = 60_000;
const MAX_EVENTS = 200;
const MAX_BONUSES_PER_TONGUE = 3;
/** Event kind carrying the WebRTC signalling between two phones (never part of a snapshot). */
export const SIGNAL_KIND = "signal";
const MAX_SIGNALS = 100;

export type ArenaMatchView = {
  id: string;
  status: ArenaMatch["status"];
  hostId: string;
  isHost: boolean;
  maxHp: number;
  eggDamage: number;
  durationSeconds: number;
  startedAt: string | null;
  endsAt: string | null;
  finishedAt: string | null;
  secondsLeft: number;
  /** Sync transport wanted by the admin; the phones fall back to polling until WebRTC exists. */
  webrtc: boolean;
  createdAt: string;
  /** For a cancelled lobby united with another one: where its players went. */
  mergedInto: string | null;
};

export type ArenaReward = { score: number; perfect: boolean; effects: PlayEffects; playsLeft: number } | { skipped: string };

export type ArenaPlayerView = {
  userId: string;
  username: string;
  creatureId: string;
  creatureName: string | null;
  markerId: number;
  /** Present in full snapshots only (first read, lobby). */
  creature?: ArCreature | null;
  status: ArenaPlayer["status"];
  hp: number;
  hitsDealt: number;
  hitsTaken: number;
  shots: number;
  goodEaten: number;
  healed: number;
  rank: number | null;
  eliminatedAt: string | null;
  mine: boolean;
  isHost: boolean;
  /** Only for the reader's own row, once the match is finished. */
  reward?: ArenaReward | null;
};

export type ArenaBonusView = { id: string; anchorUserId: string; kind: string; x: number; y: number; heal: number; expiresAt: string };

export type ArenaEventView = { id: number; actorId: string | null; kind: string; payload: Record<string, unknown>; at: string };

export type ArenaSnapshot = {
  match: ArenaMatchView;
  players: ArenaPlayerView[];
  /** Good foods still on the table. */
  bonuses: ArenaBonusView[];
  /** What happened after the `since` cursor. */
  events: ArenaEventView[];
  cursor: number;
  me: ArenaPlayerView | null;
  /** Server time of the snapshot, for the phones' clocks. */
  now: string;
};

export type ArenaListing = {
  /** Lobbies the user is invited to. */
  invitations: ArenaSnapshot[];
  /** Lobbies and battles the user takes part in. */
  open: ArenaSnapshot[];
  /** Latest finished battles of the user. */
  recent: ArenaSnapshot[];
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function logEvent(matchId: string, actorId: string | null, kind: string, payload: Record<string, unknown> = {}, now = new Date()): Promise<void> {
  await getDb().insert(arenaEvents).values({ matchId, actorId, kind, payload, createdAt: now });
}

function toMatchView(match: ArenaMatch, userId: string, now: Date, rules: GameRules, mergedInto: string | null = null): ArenaMatchView {
  return {
    id: match.id,
    status: match.status,
    hostId: match.hostId,
    isHost: match.hostId === userId,
    maxHp: match.maxHp,
    eggDamage: match.eggDamage,
    durationSeconds: match.durationSeconds,
    startedAt: iso(match.startedAt),
    endsAt: iso(match.endsAt),
    finishedAt: iso(match.finishedAt),
    secondsLeft: match.status === "playing" ? arenaSecondsLeft(match.endsAt?.getTime() ?? null, now.getTime()) : 0,
    webrtc: rules.arena.webrtc,
    createdAt: match.createdAt.toISOString(),
    mergedInto,
  };
}

/** The living, named creature of a player as the arena draws it. */
function creatureFor(creature: Creature | undefined, accessories: ReturnType<typeof outfitToEquipped>): ArCreature | null {
  if (!creature || !creature.speciesId || !creature.name) return null;
  return { name: creature.name, speciesId: creature.speciesId, stage: stageForXp(creature.xp).id, state: creature.status === "alive" ? deriveState(creature) : "sick", accessories };
}

/** A creature that can enter the arena: alive, named, marker assigned on the way. */
async function battleReady(creature: Creature | null, who: string): Promise<{ creature: Creature; marker: number }> {
  if (!creature || creature.status !== "alive") throw new DomainError("friend_unavailable", `${who} n'a pas de créature vivante pour le moment.`, 409);
  if (!creature.name) throw new DomainError("friend_unavailable", `La créature de ${who} n'a pas encore de nom.`, 409);
  return { creature, marker: await ensureCreatureMarker(creature) };
}

async function assertPlaysLeft(creature: Creature, now: Date, rules: GameRules): Promise<void> {
  if ((await countPlaysToday(creature.id, gameDate(now))) >= rules.play.maxPerDay) {
    throw new DomainError("play_limit", `${creature.name ?? "Ta créature"} a déjà joué ${rules.play.maxPerDay} fois aujourd'hui. À demain !`, 429);
  }
}

/** Lobbies nobody started within `ARENA.lobbyTtlMinutes` are cancelled. */
async function expireStaleLobbies(now: Date): Promise<void> {
  const limit = new Date(now.getTime() - ARENA.lobbyTtlMinutes * MINUTE_MS);
  await getDb()
    .update(arenaMatches)
    .set({ status: "cancelled", finishedAt: now })
    .where(and(eq(arenaMatches.status, "lobby"), lt(arenaMatches.createdAt, limit)));
}

/** Matches (lobby or playing) the user takes part in as `ready`. */
async function busyMatchIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: arenaMatches.id })
    .from(arenaPlayers)
    .innerJoin(arenaMatches, eq(arenaMatches.id, arenaPlayers.matchId))
    .where(and(eq(arenaPlayers.userId, userId), eq(arenaPlayers.status, "ready"), inArray(arenaMatches.status, ["lobby", "playing"])));
  return rows.map((r) => r.id);
}

async function assertNotBusy(userId: string, now: Date): Promise<void> {
  await expireStaleLobbies(now);
  if ((await busyMatchIds(userId)).length > 0) throw new DomainError("arena_busy", "Tu as déjà une partie d'arène en cours. Termine-la ou quitte-la d'abord.", 409);
}

export type CreateMatchOutcome = { match: ArenaMatch; players: ArenaPlayer[] };

/**
 * The host opens a lobby with some accepted friends. Everybody needs a living,
 * named creature; the host also needs a game left today. Rules are frozen in
 * the match so an admin change never surprises a running battle.
 */
export async function createMatch(hostId: string, friendIds: string[], now: Date, rules: GameRules): Promise<CreateMatchOutcome> {
  const ids = [...new Set(friendIds)].filter((id) => id !== hostId);
  if (ids.length === 0) throw new DomainError("no_friends", "Invite au moins un ami.", 400);
  if (ids.length > ARENA.maxPlayers - 1) throw new DomainError("too_many", `${ARENA.maxPlayers} joueurs au maximum, toi compris.`, 400);
  const friends = new Set(await acceptedFriendIds(hostId));
  if (ids.some((id) => !friends.has(id))) throw new DomainError("not_friends", "Tu ne peux inviter que des amis acceptés.", 403);

  const held = await getHeldCreature(hostId, null, now, rules);
  const host = await battleReady(held.creature, "Ta créature");
  await assertPlaysLeft(host.creature, now, rules);
  await assertNotBusy(hostId, now);

  const db = getDb();
  const names = await publicProfiles(ids);
  const rows = await db.select().from(creatures).where(and(inArray(creatures.userId, ids), eq(creatures.status, "alive")));
  const invited: Array<{ userId: string; creature: Creature; marker: number }> = [];
  for (const id of ids) {
    const who = names.get(id)?.username ?? "Un ami";
    const row = rows.find((c) => c.userId === id);
    const ticked = row ? await tickCreature(row, now, rules) : null;
    const ready = await battleReady(ticked, who);
    invited.push({ userId: id, ...ready });
  }
  const markers = new Map<number, string>([[host.marker, host.creature.name ?? "ta créature"]]);
  for (const p of invited) {
    const other = markers.get(p.marker);
    if (other) throw new DomainError("marker_conflict", `${p.creature.name} et ${other} ont le même numéro de marqueur : la caméra ne pourrait pas les distinguer.`, 409);
    markers.set(p.marker, p.creature.name ?? "une créature");
  }

  // One of the guests already opened a lobby and invited the host: join it instead of opening a second one (the older lobby keeps its host).
  const reciprocal = await lobbiesInvitingHostedBy(hostId, ids, now);
  if (reciprocal.length > 0) {
    const target = reciprocal[0];
    const [joined] = await db
      .update(arenaPlayers)
      .set({ status: "ready", hp: target.maxHp })
      .where(and(eq(arenaPlayers.matchId, target.id), eq(arenaPlayers.userId, hostId), eq(arenaPlayers.status, "invited")))
      .returning({ id: arenaPlayers.id });
    if (joined) {
      await carryGuests(
        target,
        invited.map((p) => ({ userId: p.userId, creatureId: p.creature.id, marker: p.marker, status: "invited" as const })),
        now,
      );
      await logEvent(target.id, hostId, "join", { merged: true, invited: ids.filter((id) => id !== target.hostId) }, now);
      return { match: await loadMatch(target.id), players: await loadPlayers(target.id, target.hostId) };
    }
  }

  const [match] = await db
    .insert(arenaMatches)
    .values({ hostId, status: "lobby", maxHp: rules.arena.hp, eggDamage: rules.arena.eggDamage, durationSeconds: rules.arena.durationSeconds, createdAt: now })
    .returning();
  const players = await db
    .insert(arenaPlayers)
    .values([
      { matchId: match.id, userId: hostId, creatureId: host.creature.id, marker: host.marker, status: "ready", hp: match.maxHp, createdAt: now },
      ...invited.map((p) => ({ matchId: match.id, userId: p.userId, creatureId: p.creature.id, marker: p.marker, status: "invited" as const, hp: match.maxHp, createdAt: now })),
    ])
    .returning();
  await logEvent(match.id, hostId, "created", { invited: ids }, now);
  return { match, players };
}

async function loadMatch(matchId: string): Promise<ArenaMatch> {
  const [match] = await getDb().select().from(arenaMatches).where(eq(arenaMatches.id, matchId)).limit(1);
  if (!match) throw new DomainError("not_found", "Cette partie est introuvable.", 404);
  return match;
}

/** The players of a match in a stable order: the host first, then by arrival, then by id. */
async function loadPlayers(matchId: string, hostId?: string): Promise<ArenaPlayer[]> {
  const rows = await getDb().select().from(arenaPlayers).where(eq(arenaPlayers.matchId, matchId)).orderBy(asc(arenaPlayers.createdAt), asc(arenaPlayers.userId));
  if (!hostId) return rows;
  return rows.sort((a, b) => (a.userId === hostId ? -1 : b.userId === hostId ? 1 : a.createdAt.getTime() - b.createdAt.getTime() || a.userId.localeCompare(b.userId)));
}

/** The match with the reader's row; anyone else gets a 404 (a match is private to its players). */
async function loadFor(userId: string, matchId: string): Promise<{ match: ArenaMatch; players: ArenaPlayer[]; me: ArenaPlayer }> {
  const match = await loadMatch(matchId);
  const players = await loadPlayers(matchId, match.hostId);
  const me = players.find((p) => p.userId === userId);
  if (!me) throw new DomainError("not_found", "Cette partie est introuvable.", 404);
  return { match, players, me };
}

const participants = (players: ArenaPlayer[]) => players.filter((p) => p.status === "ready" || p.status === "left");

/** Open lobbies hosted by one of `hostIds` in which `userId` is invited, oldest first. */
async function lobbiesInvitingHostedBy(userId: string, hostIds: string[], now: Date): Promise<ArenaMatch[]> {
  if (hostIds.length === 0) return [];
  const limit = new Date(now.getTime() - ARENA.lobbyTtlMinutes * MINUTE_MS);
  const rows = await getDb()
    .select({ match: arenaMatches })
    .from(arenaMatches)
    .innerJoin(arenaPlayers, and(eq(arenaPlayers.matchId, arenaMatches.id), eq(arenaPlayers.userId, userId), eq(arenaPlayers.status, "invited")))
    .where(and(eq(arenaMatches.status, "lobby"), gt(arenaMatches.createdAt, limit), inArray(arenaMatches.hostId, hostIds)));
  return rows.map((r) => r.match).sort(olderFirst);
}

const olderFirst = (a: ArenaMatch, b: ArenaMatch) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

type Guest = { userId: string; creatureId: string; marker: number; status: "ready" | "invited" };

/**
 * Brings guests into a lobby: newcomers are added with their status (within
 * `ARENA.maxPlayers`, skipped on a marker clash), an invited player who was
 * ready elsewhere becomes ready. Returns the ids of those now ready.
 */
async function carryGuests(into: ArenaMatch, guests: Guest[], now: Date): Promise<string[]> {
  const db = getDb();
  const current = await loadPlayers(into.id, into.hostId);
  const open = (p: { status: string }) => p.status === "ready" || p.status === "invited";
  const markers = new Set(current.filter(open).map((p) => p.marker));
  let count = current.filter(open).length;
  const joined: string[] = [];
  for (const guest of guests) {
    if (guest.userId === into.hostId) continue;
    const existing = current.find((p) => p.userId === guest.userId);
    if (existing) {
      if (guest.status === "ready" && existing.status === "invited") {
        const [up] = await db
          .update(arenaPlayers)
          .set({ status: "ready", hp: into.maxHp })
          .where(and(eq(arenaPlayers.id, existing.id), eq(arenaPlayers.status, "invited")))
          .returning({ id: arenaPlayers.id });
        if (up) joined.push(guest.userId);
      }
      continue;
    }
    if (count >= ARENA.maxPlayers || markers.has(guest.marker)) continue;
    await db
      .insert(arenaPlayers)
      .values({ matchId: into.id, userId: guest.userId, creatureId: guest.creatureId, marker: guest.marker, status: guest.status, hp: into.maxHp, createdAt: now })
      .onConflictDoNothing();
    count += 1;
    markers.add(guest.marker);
    if (guest.status === "ready") joined.push(guest.userId);
  }
  return joined;
}

/**
 * Unites lobby `from` with lobby `into` (the older one): `from` is closed
 * with a pointer to `into`, its host joins `into` as ready (they were
 * invited there) and its guests come along. Concurrent readers agree
 * through the conditional close.
 */
async function mergeLobbies(into: ArenaMatch, from: ArenaMatch, now: Date): Promise<boolean> {
  const db = getDb();
  const [target] = await db.select().from(arenaMatches).where(eq(arenaMatches.id, into.id)).limit(1);
  if (!target || target.status !== "lobby") return false;
  const [closed] = await db
    .update(arenaMatches)
    .set({ status: "cancelled", finishedAt: now })
    .where(and(eq(arenaMatches.id, from.id), eq(arenaMatches.status, "lobby")))
    .returning({ id: arenaMatches.id });
  if (!closed) return false;
  const fromPlayers = await loadPlayers(from.id, from.hostId);
  const guests: Guest[] = fromPlayers
    .filter((p) => (p.status === "ready" || p.status === "invited") && p.userId !== into.hostId)
    .map((p) => ({ userId: p.userId, creatureId: p.creatureId, marker: p.marker, status: p.userId === from.hostId ? "ready" : (p.status as "ready" | "invited") }));
  const joined = await carryGuests(target, guests, now);
  await logEvent(from.id, null, "merged", { into: into.id }, now);
  await logEvent(into.id, null, "merge", { from: from.id, host: from.hostId, joined }, now);
  return true;
}

/** Open lobbies hosted by a guest of `match` in which `match`'s host is invited: two friends invited each other. */
async function reciprocalLobbies(match: ArenaMatch, players: ArenaPlayer[], now: Date): Promise<ArenaMatch[]> {
  const guestHosts = players.filter((p) => p.userId !== match.hostId && (p.status === "invited" || p.status === "ready")).map((p) => p.userId);
  const lobbies = await lobbiesInvitingHostedBy(match.hostId, guestHosts, now);
  return lobbies.filter((m) => m.id !== match.id);
}

/** Unites `match` with the lobbies of friends who invited its host back: the oldest lobby keeps its host. */
async function mergeReciprocal(match: ArenaMatch, players: ArenaPlayer[], now: Date): Promise<{ match: ArenaMatch; players: ArenaPlayer[] }> {
  if (match.status !== "lobby") return { match, players };
  const others = await reciprocalLobbies(match, players, now);
  if (others.length === 0) return { match, players };
  const older = others.find((o) => olderFirst(o, match) < 0);
  if (older) await mergeLobbies(older, match, now);
  else for (const newer of others) await mergeLobbies(match, newer, now);
  return { match: await loadMatch(match.id), players: await loadPlayers(match.id, match.hostId) };
}

/** The caller must be a ready player of a match still open (lobby or battle), e.g. to receive relay credentials. */
export async function assertArenaPlayer(userId: string, matchId: string): Promise<void> {
  const { match, me } = await loadFor(userId, matchId);
  if (match.status !== "lobby" && match.status !== "playing") throw new DomainError("arena_closed", "La partie est terminée.", 409);
  if (me.status !== "ready") throw new DomainError("not_found", "Tu ne participes pas à cette partie.", 404);
}
const alivePlayers = (players: ArenaPlayer[]) => players.filter((p) => p.status === "ready" && p.hp > 0 && !p.eliminatedAt);

/**
 * Closes a playing match when time is up or at most one creature stands:
 * ranks are frozen here, rewards are given lazily to each player on their
 * next read. Concurrent readers agree through the conditional update.
 */
async function finishIfOver(match: ArenaMatch, players: ArenaPlayer[], now: Date): Promise<ArenaMatch> {
  if (match.status !== "playing") return match;
  const timeUp = match.endsAt !== null && now.getTime() >= match.endsAt.getTime();
  const standing = alivePlayers(players);
  if (!timeUp && standing.length > 1) return match;
  const finishedAt = timeUp && match.endsAt ? match.endsAt : now;
  const db = getDb();
  const [closed] = await db
    .update(arenaMatches)
    .set({ status: "finished", finishedAt })
    .where(and(eq(arenaMatches.id, match.id), eq(arenaMatches.status, "playing")))
    .returning();
  if (!closed) return loadMatch(match.id);
  const ranks = rankArenaPlayers(
    participants(players).map((p) => ({
      userId: p.userId,
      alive: p.status === "ready" && p.hp > 0 && !p.eliminatedAt,
      hp: p.hp,
      hitsDealt: p.hitsDealt,
      outAt: p.eliminatedAt?.getTime() ?? null,
    })),
  );
  for (const [playerId, rank] of ranks) {
    await db.update(arenaPlayers).set({ rank }).where(and(eq(arenaPlayers.matchId, match.id), eq(arenaPlayers.userId, playerId)));
  }
  await logEvent(match.id, null, "finish", { reason: timeUp ? "time" : "last_standing" }, now);
  return closed;
}

/** Drops the good food that is due (one per read at most) and forgets the ones that rotted. */
async function tickBonuses(match: ArenaMatch, players: ArenaPlayer[], now: Date, random: () => number): Promise<void> {
  if (match.status !== "playing" || !match.nextBonusAt || match.nextBonusAt.getTime() > now.getTime()) return;
  const db = getDb();
  const next = new Date(now.getTime() + ARENA.bonusEverySeconds * 1000);
  const [reserved] = await db
    .update(arenaMatches)
    .set({ nextBonusAt: next })
    .where(and(eq(arenaMatches.id, match.id), eq(arenaMatches.nextBonusAt, match.nextBonusAt)))
    .returning({ id: arenaMatches.id });
  if (!reserved) return;
  match.nextBonusAt = next;
  const [active] = await db
    .select({ count: sql<number>`count(*)` })
    .from(arenaBonuses)
    .where(and(eq(arenaBonuses.matchId, match.id), isNull(arenaBonuses.eatenBy), gt(arenaBonuses.expiresAt, now)));
  if (Number(active?.count ?? 0) >= ARENA.maxBonuses) return;
  const placement = placeArenaBonus(
    random,
    alivePlayers(players).map((p) => p.userId),
  );
  if (!placement) return;
  await db.insert(arenaBonuses).values({
    matchId: match.id,
    anchorUserId: placement.anchorUserId,
    kind: placement.kind,
    x: placement.x,
    y: placement.y,
    heal: placement.heal,
    expiresAt: new Date(now.getTime() + ARENA.bonusStaySeconds * 1000),
    createdAt: now,
  });
}

/** The reader's reward once the match is finished: one game recorded, like the food catch (spec § 3.22). */
async function rewardIfDue(match: ArenaMatch, me: ArenaPlayer, now: Date, rules: GameRules): Promise<ArenaPlayer> {
  if (match.status !== "finished" || me.rewardedAt) return me;
  const db = getDb();
  const [reserved] = await db
    .update(arenaPlayers)
    .set({ rewardedAt: now })
    .where(and(eq(arenaPlayers.id, me.id), isNull(arenaPlayers.rewardedAt)))
    .returning();
  if (!reserved) return (await db.select().from(arenaPlayers).where(eq(arenaPlayers.id, me.id)))[0] ?? me;
  let reward: ArenaReward;
  if (me.status !== "ready") reward = { skipped: me.status === "left" ? "left" : "absent" };
  else {
    const count = participants(await loadPlayers(match.id, match.hostId)).length;
    const { score, perfect } = arenaScore(me.hp, match.maxHp, me.rank ?? count, count);
    try {
      const [creature] = await db.select().from(creatures).where(and(eq(creatures.id, me.creatureId), eq(creatures.userId, me.userId))).limit(1);
      if (!creature) throw new DomainError("no_creature", "Créature introuvable.", 409);
      const ticked = await tickCreature(creature, now, rules);
      const result = await recordPlay(me.userId, ticked, score, now, {}, rules, "arena");
      reward = { score, perfect, effects: result.effects, playsLeft: result.playsLeft };
    } catch (error) {
      reward = { skipped: error instanceof DomainError ? error.code : "error" };
    }
  }
  const [updated] = await db.update(arenaPlayers).set({ reward }).where(eq(arenaPlayers.id, me.id)).returning();
  return updated ?? reserved;
}

/** Applies what time did to the match since the last read: stale lobby, due bonus, end of the battle. */
async function settle(match: ArenaMatch, players: ArenaPlayer[], now: Date, random: () => number): Promise<{ match: ArenaMatch; players: ArenaPlayer[] }> {
  if (match.status === "lobby" && match.createdAt.getTime() + ARENA.lobbyTtlMinutes * MINUTE_MS < now.getTime()) {
    await expireStaleLobbies(now);
    return { match: await loadMatch(match.id), players };
  }
  if (match.status === "lobby") return mergeReciprocal(match, players, now);
  if (match.status !== "playing") return { match, players };
  await tickBonuses(match, players, now, random);
  const finished = await finishIfOver(match, players, now);
  if (finished.status !== match.status) return { match: finished, players: await loadPlayers(match.id, match.hostId) };
  return { match: finished, players };
}

async function playerViews(match: ArenaMatch, players: ArenaPlayer[], userId: string, full: boolean): Promise<ArenaPlayerView[]> {
  const names = await publicProfiles(players.map((p) => p.userId));
  let byCreature = new Map<string, Creature>();
  if (full && players.length > 0) {
    const rows = await getDb().select().from(creatures).where(inArray(creatures.id, players.map((p) => p.creatureId)));
    byCreature = new Map(rows.map((c) => [c.id, c]));
  }
  const views: ArenaPlayerView[] = [];
  for (const p of players) {
    const view: ArenaPlayerView = {
      userId: p.userId,
      username: names.get(p.userId)?.username ?? "Un ami",
      creatureId: p.creatureId,
      creatureName: byCreature.get(p.creatureId)?.name ?? null,
      markerId: p.marker,
      status: p.status,
      hp: p.hp,
      hitsDealt: p.hitsDealt,
      hitsTaken: p.hitsTaken,
      shots: p.shots,
      goodEaten: p.goodEaten,
      healed: p.healed,
      rank: p.rank,
      eliminatedAt: iso(p.eliminatedAt),
      mine: p.userId === userId,
      isHost: p.userId === match.hostId,
    };
    if (full) {
      const creature = byCreature.get(p.creatureId);
      view.creature = creatureFor(creature, creature ? outfitToEquipped(await getOutfit(creature.id)) : []);
    }
    if (p.userId === userId && match.status === "finished") view.reward = (p.reward as ArenaReward | null) ?? null;
    views.push(view);
  }
  return views;
}

const toBonusView = (b: ArenaBonus): ArenaBonusView => ({ id: b.id, anchorUserId: b.anchorUserId, kind: b.kind, x: b.x, y: b.y, heal: b.heal, expiresAt: b.expiresAt.toISOString() });

const toEventView = (e: ArenaEvent): ArenaEventView => ({ id: e.id, actorId: e.actorId, kind: e.kind, payload: (e.payload ?? {}) as Record<string, unknown>, at: e.createdAt.toISOString() });

export type SnapshotOptions = {
  /** Events after this id only; omitted = full snapshot with the creatures' drawings and no events. */
  since?: number;
  random?: () => number;
};

/** What a player's phone needs to draw the match right now (lazy tick applied). */
export async function snapshot(userId: string, matchId: string, now: Date, rules: GameRules, options: SnapshotOptions = {}): Promise<ArenaSnapshot> {
  const loaded = await loadFor(userId, matchId);
  const settled = await settle(loaded.match, loaded.players, now, options.random ?? Math.random);
  let players = settled.players;
  const mine = players.find((p) => p.userId === userId);
  if (mine) {
    const rewarded = await rewardIfDue(settled.match, mine, now, rules);
    if (rewarded !== mine) players = players.map((p) => (p.id === rewarded.id ? rewarded : p));
  }
  const full = options.since === undefined;
  const db = getDb();
  const [views, bonuses, events] = await Promise.all([
    playerViews(settled.match, players, userId, full),
    settled.match.status === "playing"
      ? db
          .select()
          .from(arenaBonuses)
          .where(and(eq(arenaBonuses.matchId, matchId), isNull(arenaBonuses.eatenBy), gt(arenaBonuses.expiresAt, now)))
          .orderBy(asc(arenaBonuses.createdAt))
      : Promise.resolve([] as ArenaBonus[]),
    full
      ? Promise.resolve([] as ArenaEvent[])
      : db
          .select()
          .from(arenaEvents)
          .where(and(eq(arenaEvents.matchId, matchId), ne(arenaEvents.kind, SIGNAL_KIND), gt(arenaEvents.id, options.since ?? 0)))
          .orderBy(asc(arenaEvents.id))
          .limit(MAX_EVENTS),
  ]);
  let cursor = options.since ?? 0;
  if (full) {
    const [last] = await db.select({ id: arenaEvents.id }).from(arenaEvents).where(eq(arenaEvents.matchId, matchId)).orderBy(desc(arenaEvents.id)).limit(1);
    cursor = last?.id ?? 0;
  } else if (events.length > 0) cursor = events[events.length - 1].id;
  let mergedInto: string | null = null;
  if (settled.match.status === "cancelled") {
    const [merged] = await db
      .select({ payload: arenaEvents.payload })
      .from(arenaEvents)
      .where(and(eq(arenaEvents.matchId, matchId), eq(arenaEvents.kind, "merged")))
      .orderBy(desc(arenaEvents.id))
      .limit(1);
    const into = (merged?.payload as { into?: unknown } | undefined)?.into;
    if (typeof into === "string") mergedInto = into;
  }
  return {
    match: toMatchView(settled.match, userId, now, rules, mergedInto),
    players: views,
    bonuses: bonuses.map(toBonusView),
    events: events.map(toEventView),
    cursor,
    me: views.find((v) => v.mine) ?? null,
    now: now.toISOString(),
  };
}

/** The user's invitations, open matches and latest results (full snapshots). */
export async function listMatchesFor(userId: string, now: Date, rules: GameRules): Promise<ArenaListing> {
  await expireStaleLobbies(now);
  const rows = await getDb()
    .select({ match: arenaMatches, player: arenaPlayers })
    .from(arenaPlayers)
    .innerJoin(arenaMatches, eq(arenaMatches.id, arenaPlayers.matchId))
    .where(and(eq(arenaPlayers.userId, userId), or(inArray(arenaMatches.status, ["lobby", "playing"]), eq(arenaMatches.status, "finished"))))
    .orderBy(desc(arenaMatches.createdAt))
    .limit(30);
  const listing: ArenaListing = { invitations: [], open: [], recent: [] };
  for (const row of rows) {
    const status = row.match.status;
    const mine = row.player.status;
    if (status === "lobby" && mine === "invited") listing.invitations.push(await snapshot(userId, row.match.id, now, rules));
    else if ((status === "lobby" || status === "playing") && mine === "ready") listing.open.push(await snapshot(userId, row.match.id, now, rules));
    else if (status === "finished" && (mine === "ready" || mine === "left") && listing.recent.length < 5) listing.recent.push(await snapshot(userId, row.match.id, now, rules));
  }
  // A lobby may have been closed by `snapshot` (stale) or a battle finished: keep the lists honest.
  listing.invitations = listing.invitations.filter((s) => s.match.status === "lobby");
  const finishedNow = listing.open.filter((s) => s.match.status === "finished");
  listing.open = listing.open.filter((s) => s.match.status === "lobby" || s.match.status === "playing");
  listing.recent = [...finishedNow, ...listing.recent].slice(0, 5);
  return listing;
}

/** Pending invitations, for the Amis tab badge. */
export type ArenaInviteNotice = {
  matchId: string;
  hostId: string;
  hostName: string;
  createdAt: string;
  /** The other guests (ready or invited), without the host and the reader. */
  players: string[];
};

/** The reader's pending invitations, newest first, for the live notice shown on every page (no write, no settle). */
export async function listArenaInvites(userId: string, now: Date = new Date()): Promise<ArenaInviteNotice[]> {
  const db = getDb();
  const limit = new Date(now.getTime() - ARENA.lobbyTtlMinutes * MINUTE_MS);
  // Two friends who invited each other: unite their lobbies (the older keeps its host) before answering.
  const hosted = await db.select().from(arenaMatches).where(and(eq(arenaMatches.hostId, userId), eq(arenaMatches.status, "lobby"), gt(arenaMatches.createdAt, limit)));
  for (const lobby of hosted) await mergeReciprocal(lobby, await loadPlayers(lobby.id, lobby.hostId), now);
  const rows = await db
    .select({ match: arenaMatches })
    .from(arenaPlayers)
    .innerJoin(arenaMatches, eq(arenaMatches.id, arenaPlayers.matchId))
    .where(and(eq(arenaPlayers.userId, userId), eq(arenaPlayers.status, "invited"), eq(arenaMatches.status, "lobby"), gt(arenaMatches.createdAt, limit)))
    .orderBy(desc(arenaMatches.createdAt))
    .limit(5);
  if (rows.length === 0) return [];
  const players = await db.select().from(arenaPlayers).where(inArray(arenaPlayers.matchId, rows.map((r) => r.match.id)));
  const names = await publicProfiles([...players.map((p) => p.userId), ...rows.map((r) => r.match.hostId)]);
  return rows.map(({ match }) => ({
    matchId: match.id,
    hostId: match.hostId,
    hostName: names.get(match.hostId)?.username ?? "Un ami",
    createdAt: match.createdAt.toISOString(),
    players: players
      .filter((p) => p.matchId === match.id && p.userId !== userId && p.userId !== match.hostId && (p.status === "ready" || p.status === "invited"))
      .map((p) => names.get(p.userId)?.username ?? "Un ami"),
  }));
}

export async function countArenaInvites(userId: string, now: Date = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - ARENA.lobbyTtlMinutes * MINUTE_MS);
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(arenaPlayers)
    .innerJoin(arenaMatches, eq(arenaMatches.id, arenaPlayers.matchId))
    .where(and(eq(arenaPlayers.userId, userId), eq(arenaPlayers.status, "invited"), eq(arenaMatches.status, "lobby"), gt(arenaMatches.createdAt, limit)));
  return Number(row?.count ?? 0);
}

/** An invited friend joins (their creature and daily games are checked again) or declines. */
export async function respondToInvite(userId: string, matchId: string, accept: boolean, now: Date, rules: GameRules): Promise<ArenaSnapshot> {
  const { match, me } = await loadFor(userId, matchId);
  if (match.status !== "lobby" || match.createdAt.getTime() + ARENA.lobbyTtlMinutes * MINUTE_MS < now.getTime()) {
    throw new DomainError("arena_closed", "Cette partie n'attend plus de joueurs.", 409);
  }
  if (me.status !== "invited") throw new DomainError("already_answered", "Tu as déjà répondu à cette invitation.", 409);
  if (accept) {
    const held = await getHeldCreature(userId, null, now, rules);
    const ready = await battleReady(held.creature, "Ta créature");
    if (ready.creature.id !== me.creatureId) throw new DomainError("creature_changed", "Ta créature a changé depuis l'invitation.", 409);
    await assertPlaysLeft(ready.creature, now, rules);
    await assertNotBusy(userId, now);
  }
  const [updated] = await getDb()
    .update(arenaPlayers)
    .set({ status: accept ? "ready" : "declined" })
    .where(and(eq(arenaPlayers.id, me.id), eq(arenaPlayers.status, "invited")))
    .returning();
  if (!updated) throw new DomainError("already_answered", "Tu as déjà répondu à cette invitation.", 409);
  await logEvent(matchId, userId, accept ? "join" : "decline", {}, now);
  return snapshot(userId, matchId, now, rules);
}

/** The host starts the battle with at least two ready players; the undecided are counted out. */
export async function startMatch(hostId: string, matchId: string, now: Date, rules: GameRules): Promise<ArenaSnapshot> {
  const { match, players } = await loadFor(hostId, matchId);
  if (match.hostId !== hostId) throw new DomainError("forbidden", "Seul l'hôte peut lancer la partie.", 403);
  if (match.status !== "lobby") throw new DomainError("arena_closed", "Cette partie a déjà commencé.", 409);
  const ready = players.filter((p) => p.status === "ready");
  if (ready.length < 2) throw new DomainError("not_enough_players", "Attends qu'au moins un ami rejoigne la partie.", 409);
  const db = getDb();
  const endsAt = new Date(now.getTime() + match.durationSeconds * 1000);
  const [started] = await db
    .update(arenaMatches)
    .set({ status: "playing", startedAt: now, endsAt, nextBonusAt: new Date(now.getTime() + ARENA.firstBonusSeconds * 1000) })
    .where(and(eq(arenaMatches.id, matchId), eq(arenaMatches.status, "lobby")))
    .returning();
  if (!started) throw new DomainError("arena_closed", "Cette partie a déjà commencé.", 409);
  await db.update(arenaPlayers).set({ hp: match.maxHp }).where(and(eq(arenaPlayers.matchId, matchId), eq(arenaPlayers.status, "ready")));
  await db.update(arenaPlayers).set({ status: "declined" }).where(and(eq(arenaPlayers.matchId, matchId), eq(arenaPlayers.status, "invited")));
  await logEvent(matchId, hostId, "start", { endsAt: endsAt.toISOString() }, now);
  return snapshot(hostId, matchId, now, rules);
}

/** A player leaves: a lobby forgets them (the host's leaving cancels it), a battle counts them out. */
export async function leaveMatch(userId: string, matchId: string, now: Date, rules: GameRules): Promise<ArenaSnapshot> {
  const { match, me } = await loadFor(userId, matchId);
  if (match.status === "lobby" && match.hostId === userId) return cancelMatch(userId, matchId, now, rules);
  if (match.status !== "lobby" && match.status !== "playing") throw new DomainError("arena_closed", "Cette partie est terminée.", 409);
  if (me.status !== "ready" && me.status !== "invited") throw new DomainError("already_answered", "Tu ne participes pas à cette partie.", 409);
  const db = getDb();
  const [updated] = await db
    .update(arenaPlayers)
    .set(match.status === "playing" ? { status: "left", eliminatedAt: me.eliminatedAt ?? now } : { status: me.status === "invited" ? "declined" : "left" })
    .where(and(eq(arenaPlayers.id, me.id), inArray(arenaPlayers.status, ["ready", "invited"])))
    .returning();
  if (!updated) throw new DomainError("already_answered", "Tu ne participes pas à cette partie.", 409);
  await logEvent(matchId, userId, "leave", {}, now);
  if (match.status === "playing") await finishIfOver(match, await loadPlayers(matchId, match.hostId), now);
  return snapshot(userId, matchId, now, rules);
}

/** The host closes a lobby before it starts. */
export async function cancelMatch(hostId: string, matchId: string, now: Date, rules: GameRules): Promise<ArenaSnapshot> {
  const { match } = await loadFor(hostId, matchId);
  if (match.hostId !== hostId) throw new DomainError("forbidden", "Seul l'hôte peut annuler la partie.", 403);
  const [cancelled] = await getDb()
    .update(arenaMatches)
    .set({ status: "cancelled", finishedAt: now })
    .where(and(eq(arenaMatches.id, matchId), eq(arenaMatches.status, "lobby")))
    .returning();
  if (!cancelled) throw new DomainError("arena_closed", "Cette partie a déjà commencé.", 409);
  await logEvent(matchId, hostId, "cancel", {}, now);
  return snapshot(hostId, matchId, now, rules);
}

/** A playing match where the caller still stands, or the reason they cannot act. */
async function loadPlaying(userId: string, matchId: string, now: Date, random: () => number): Promise<{ match: ArenaMatch; players: ArenaPlayer[]; me: ArenaPlayer }> {
  const loaded = await loadFor(userId, matchId);
  const settled = await settle(loaded.match, loaded.players, now, random);
  if (settled.match.status !== "playing") throw new DomainError("arena_over", "La partie est terminée.", 409);
  const me = settled.players.find((p) => p.userId === userId)!;
  if (me.status !== "ready" || me.hp <= 0 || me.eliminatedAt) throw new DomainError("eliminated", "Ta créature est hors jeu.", 409);
  return { match: settled.match, players: settled.players, me };
}

export type ShotInput = {
  /** The adversary aimed at (null: nobody in reach, the egg lands on the table). */
  targetUserId: string | null;
  /** Landing point in the target's marker frame. */
  x: number;
  y: number;
  /** Judged by the shooter's phone: the egg touched the creature. */
  hit: boolean;
  /** Id of the shot chosen by the phone, echoed in the event so a phone that already saw it over the direct link skips it. */
  nonce?: string;
};

export type ShotOutcome = { accepted: boolean; hit: boolean; targetHp: number | null; eliminated: boolean };

/**
 * Records an egg. The server enforces the cadence and the damage; the hit
 * itself is judged by the shooter's phone (spec § 3.22). Shots that arrive
 * too fast are simply dropped.
 */
export async function recordShot(userId: string, matchId: string, shot: ShotInput, now: Date, random: () => number = Math.random): Promise<ShotOutcome> {
  const { match, players, me } = await loadPlaying(userId, matchId, now, random);
  const db = getDb();
  const earliest = new Date(now.getTime() - ARENA.shotMinIntervalMs);
  const [counted] = await db
    .update(arenaPlayers)
    .set({ shots: sql`${arenaPlayers.shots} + 1`, lastShotAt: now })
    .where(and(eq(arenaPlayers.id, me.id), or(isNull(arenaPlayers.lastShotAt), lt(arenaPlayers.lastShotAt, earliest))))
    .returning({ id: arenaPlayers.id });
  if (!counted) return { accepted: false, hit: false, targetHp: null, eliminated: false };

  const target = shot.targetUserId ? players.find((p) => p.userId === shot.targetUserId && p.userId !== userId) : undefined;
  const canHit = shot.hit && target !== undefined && target.status === "ready" && target.hp > 0 && !target.eliminatedAt;
  if (!canHit) {
    await logEvent(matchId, userId, "egg", { target: target?.userId ?? null, x: shot.x, y: shot.y, hit: false, ...withNonce(shot.nonce) }, now);
    return { accepted: true, hit: false, targetHp: target?.hp ?? null, eliminated: false };
  }
  const damage = match.eggDamage;
  const [struck] = await db
    .update(arenaPlayers)
    .set({
      hp: sql`GREATEST(0, ${arenaPlayers.hp} - ${damage})`,
      hitsTaken: sql`${arenaPlayers.hitsTaken} + 1`,
      eliminatedAt: sql`CASE WHEN ${arenaPlayers.hp} - ${damage} <= 0 THEN ${now} ELSE ${arenaPlayers.eliminatedAt} END`,
    })
    .where(and(eq(arenaPlayers.id, target.id), eq(arenaPlayers.status, "ready"), gt(arenaPlayers.hp, 0)))
    .returning({ hp: arenaPlayers.hp });
  if (!struck) {
    await logEvent(matchId, userId, "egg", { target: target.userId, x: shot.x, y: shot.y, hit: false, ...withNonce(shot.nonce) }, now);
    return { accepted: true, hit: false, targetHp: 0, eliminated: false };
  }
  await db.update(arenaPlayers).set({ hitsDealt: sql`${arenaPlayers.hitsDealt} + 1` }).where(eq(arenaPlayers.id, me.id));
  const eliminated = struck.hp <= 0;
  await logEvent(matchId, userId, "egg", { target: target.userId, x: shot.x, y: shot.y, hit: true, hp: struck.hp, ...withNonce(shot.nonce) }, now);
  if (eliminated) {
    await logEvent(matchId, target.userId, "eliminated", { by: userId }, now);
    await finishIfOver(match, await loadPlayers(matchId, match.hostId), now);
  }
  return { accepted: true, hit: true, targetHp: struck.hp, eliminated };
}

export type TongueInput = {
  /** Good foods the tongue swept, judged by the player's phone. */
  bonusIds: string[];
  /** Direction (radians, in the player's marker frame) and length, replayed on the other phones. */
  angle: number;
  length: number;
  /** Id of the lick chosen by the phone (see `ShotInput.nonce`). */
  nonce?: string;
};

export type TongueOutcome = { eaten: Array<{ id: string; kind: string; heal: number }>; healed: number; hp: number };

/** The tongue: each good food still on the table is eaten once (conditional update), health capped at the match maximum. */
export async function eatBonuses(userId: string, matchId: string, tongue: TongueInput, now: Date, random: () => number = Math.random): Promise<TongueOutcome> {
  const { match, me } = await loadPlaying(userId, matchId, now, random);
  const db = getDb();
  const eaten: TongueOutcome["eaten"] = [];
  for (const id of [...new Set(tongue.bonusIds)].slice(0, MAX_BONUSES_PER_TONGUE)) {
    const [row] = await db
      .update(arenaBonuses)
      .set({ eatenBy: userId, eatenAt: now })
      .where(and(eq(arenaBonuses.id, id), eq(arenaBonuses.matchId, matchId), isNull(arenaBonuses.eatenBy), gt(arenaBonuses.expiresAt, now)))
      .returning({ id: arenaBonuses.id, kind: arenaBonuses.kind, heal: arenaBonuses.heal });
    if (row) eaten.push(row);
  }
  const heal = eaten.reduce((sum, b) => sum + b.heal, 0);
  let hp = me.hp;
  let healed = 0;
  if (heal > 0) {
    const [updated] = await db
      .update(arenaPlayers)
      .set({
        hp: sql`LEAST(${match.maxHp}, ${arenaPlayers.hp} + ${heal})`,
        healed: sql`${arenaPlayers.healed} + (LEAST(${match.maxHp}, ${arenaPlayers.hp} + ${heal}) - ${arenaPlayers.hp})`,
        goodEaten: sql`${arenaPlayers.goodEaten} + ${eaten.length}`,
      })
      .where(and(eq(arenaPlayers.id, me.id), eq(arenaPlayers.status, "ready"), gt(arenaPlayers.hp, 0)))
      .returning({ hp: arenaPlayers.hp, healed: arenaPlayers.healed });
    if (updated) {
      hp = updated.hp;
      healed = updated.healed - me.healed;
    }
  }
  await logEvent(matchId, userId, "tongue", { angle: tongue.angle, length: tongue.length, bonusIds: eaten.map((b) => b.id), healed, hp, ...withNonce(tongue.nonce) }, now);
  return { eaten, healed, hp };
}

const withNonce = (nonce: string | undefined): { nonce?: string } => (nonce ? { nonce } : {});

export type ArenaSignalView = { id: number; from: string; payload: Record<string, unknown> };

/**
 * WebRTC signalling between two phones of a match (spec § 3.22): offers,
 * answers and hellos travel through the event log as `signal` events
 * addressed to one player. Only lobby and battle accept them.
 */
export async function postSignal(userId: string, matchId: string, to: string, payload: Record<string, unknown>, now: Date): Promise<void> {
  const { match, players } = await loadFor(userId, matchId);
  if (match.status !== "lobby" && match.status !== "playing") throw new DomainError("arena_closed", "La partie est terminée.", 409);
  const target = players.find((p) => p.userId === to && p.status === "ready");
  if (!target || to === userId) throw new DomainError("not_found", "Ce joueur n'est pas dans la partie.", 404);
  await logEvent(matchId, userId, SIGNAL_KIND, { ...payload, to }, now);
}

/** The signals addressed to the caller after `since`, with the cursor to ask from next time. */
export async function listSignals(userId: string, matchId: string, since: number): Promise<{ signals: ArenaSignalView[]; cursor: number }> {
  await loadFor(userId, matchId);
  const rows = await getDb()
    .select()
    .from(arenaEvents)
    .where(and(eq(arenaEvents.matchId, matchId), eq(arenaEvents.kind, SIGNAL_KIND), gt(arenaEvents.id, since)))
    .orderBy(asc(arenaEvents.id))
    .limit(MAX_SIGNALS);
  const signals: ArenaSignalView[] = [];
  for (const row of rows) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (payload.to !== userId || !row.actorId) continue;
    const { to: _to, ...rest } = payload;
    void _to;
    signals.push({ id: row.id, from: row.actorId, payload: rest });
  }
  return { signals, cursor: rows.length > 0 ? rows[rows.length - 1].id : since };
}
