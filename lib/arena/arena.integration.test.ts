import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addAccessoryCopies, equipAccessory, getOutfit, getOwnedAccessories } from "@/lib/accessories/service";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { arenaBonuses, arenaMatches, arenaPlayers, arenaStakes, playSessions, profiles, userAccessories } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { ARENA } from "@/lib/game/config";
import { DEFAULT_RULES, type GameRules } from "@/lib/game/rules";
import { recordPlay } from "@/lib/play/service";
import { saveManualSteps } from "@/lib/steps/service";
import { deletePhotoMarker, savePhotoMarker } from "@/lib/ar/photo-marker";
import type { ObjectStorage } from "@/lib/storage/r2";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import {
  agreeStakes,
  cancelMatch,
  countArenaInvites,
  createMatch,
  eatBonuses,
  finishCoop,
  finishPingPong,
  leaveMatch,
  logMatchEvent,
  listArenaInvites,
  listMatchesFor,
  listSignals,
  postSignal,
  recordShot,
  respondToInvite,
  setStake,
  snapshot,
  startMatch,
  storeMatchState,
} from "./service";
import { createDefense, startDefense } from "@/lib/game/defense";
import { coopRandom, serializeDefense } from "@/lib/game/coop";
import { createPingPong, pingpongScore, serializePingPong, servePingPong } from "@/lib/game/pingpong";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;
let dave: string;
const T0 = new Date("2026-09-16T10:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const photoStore = new Map<string, Uint8Array>();
const photoStorage: ObjectStorage = {
  async put(key, bytes) {
    photoStore.set(key, bytes);
  },
  async get(key) {
    const bytes = photoStore.get(key);
    return bytes ? { bytes, contentType: "image/jpeg" } : null;
  },
  async signedUrl(key) {
    return `https://signed.example/${key}`;
  },
  async remove(key) {
    photoStore.delete(key);
  },
  async removePrefix() {
    return 0;
  },
};

const RULES: GameRules = { ...DEFAULT_RULES, arena: { hp: 30, eggDamage: 10, durationSeconds: 120, webrtc: false } };

async function befriend(a: string, b: string) {
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, b));
  await sendFriendRequest(a, profile.friendCode);
  const requests = await listRequests(b);
  await acceptFriendRequest(b, requests.incoming[0].id);
}

/** Every ready player validates the pot (even empty) before the host may start an arena battle. */
async function agreeAll(matchId: string, ids: string[], when: Date) {
  for (const id of ids) await agreeStakes(id, matchId, when, RULES);
}

async function hatchNamed(userId: string, name: string) {
  await createEgg(userId, "facile");
  // The egg is laid on the real day: its steps must be saved on that day, whatever T0 is.
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId));
  await hatchEgg(userId, T0);
  await nameCreature(userId, name);
}

beforeAll(async () => {
  tdb = await createTestDatabase();
  alice = await insertTestUser(tdb.db, "alice@example.com", "Alice");
  bob = await insertTestUser(tdb.db, "bob@example.com", "Bob");
  carol = await insertTestUser(tdb.db, "carol@example.com", "Carol");
  dave = await insertTestUser(tdb.db, "dave@example.com", "Dave");
  await getDb().insert(profiles).values([
    { userId: alice, username: "Alice", friendCode: "MM-AAAAAA" },
    { userId: bob, username: "Bob", friendCode: "MM-BBBBBB" },
    { userId: carol, username: "Carol", friendCode: "MM-CCCCCC" },
    { userId: dave, username: "Dave", friendCode: "MM-DDDDDD" },
  ]);
  await hatchNamed(alice, "Miso");
  await hatchNamed(bob, "Pipo");
  await createEgg(carol, "facile");
  await hatchNamed(dave, "Nono");
  await befriend(alice, bob);
  await befriend(alice, carol);
});

afterAll(async () => {
  await tdb.close();
});

describe("lobby", () => {
  it("refuses strangers, friends without a living creature and empty invitations", async () => {
    await expect(createMatch(alice, [], T0, RULES)).rejects.toMatchObject({ code: "no_friends" });
    await expect(createMatch(alice, [dave], T0, RULES)).rejects.toMatchObject({ code: "not_friends" });
    await expect(createMatch(alice, [carol], T0, RULES)).rejects.toMatchObject({ code: "friend_unavailable" });
  });

  it("opens a lobby with frozen rules, the host ready and the friends invited", async () => {
    const { match, players } = await createMatch(alice, [bob], T0, RULES);
    expect(match.status).toBe("lobby");
    expect(match.maxHp).toBe(30);
    expect(match.eggDamage).toBe(10);
    expect(players.map((p) => [p.userId, p.status])).toEqual([
      [alice, "ready"],
      [bob, "invited"],
    ]);
    expect(players.every((p) => p.marker >= 0)).toBe(true);
    expect(await countArenaInvites(bob, T0)).toBe(1);
    expect(await countArenaInvites(alice, T0)).toBe(0);
    const notices = await listArenaInvites(bob, T0);
    expect(notices).toEqual([{ matchId: match.id, hostId: alice, hostName: "Alice", createdAt: T0.toISOString(), players: [], mode: "arena" }]);
    expect(await listArenaInvites(alice, T0)).toEqual([]);
    expect(await listArenaInvites(bob, at(ARENA.lobbyTtlMinutes * 60 + 1))).toEqual([]);
    // A player's photo marker travels in full snapshots only: the other phones recognise it as that player's number.
    const photo = await savePhotoMarker(bob, { bytes: Uint8Array.of(7), mimeType: "image/jpeg" }, photoStorage, T0, "bob-photo");
    const withPhoto = await snapshot(alice, match.id, at(1), RULES);
    expect(withPhoto.players.map((p) => [p.userId, p.markerImage])).toEqual([
      [alice, null],
      [bob, photo.imageUrl],
    ]);
    const sincePhoto = await snapshot(alice, match.id, at(2), RULES, { since: withPhoto.cursor });
    expect(sincePhoto.players.every((p) => p.markerImage === undefined)).toBe(true);
    await deletePhotoMarker(bob, photoStorage);

    await expect(createMatch(alice, [bob], T0, RULES)).rejects.toMatchObject({ code: "arena_busy" });
    await expect(startMatch(alice, match.id, T0, RULES)).rejects.toMatchObject({ code: "not_enough_players" });
    await expect(startMatch(bob, match.id, T0, RULES)).rejects.toMatchObject({ code: "forbidden" });
    await expect(snapshot(dave, match.id, T0, RULES)).rejects.toMatchObject({ code: "not_found" });

    const listing = await listMatchesFor(bob, T0, RULES);
    expect(listing.invitations.map((s) => s.match.id)).toEqual([match.id]);
    const full = listing.invitations[0];
    expect(full.players[0].creature?.name).toBe("Miso");
    expect(full.players[1].creature?.name).toBe("Pipo");
    expect(full.me?.status).toBe("invited");

    await cancelMatch(alice, match.id, at(1), RULES);
    expect((await snapshot(bob, match.id, at(1), RULES)).match.status).toBe("cancelled");
    expect(await countArenaInvites(bob, at(1))).toBe(0);
    expect(await listArenaInvites(bob, at(1))).toEqual([]);
  });

  it("unites two friends who invite each other: the second joins the first lobby, whose creator stays host", async () => {
    const { match: first } = await createMatch(alice, [bob], T0, RULES);
    const { match: second, players } = await createMatch(bob, [alice], at(1), RULES);
    expect(second.id).toBe(first.id);
    expect(second.hostId).toBe(alice);
    expect(players.map((p) => [p.userId, p.status])).toEqual([
      [alice, "ready"],
      [bob, "ready"],
    ]);
    expect(await countArenaInvites(bob, at(1))).toBe(0);
    const [row] = await getDb().select().from(arenaMatches).where(eq(arenaMatches.hostId, bob));
    expect(row).toBeUndefined();
    await cancelMatch(alice, first.id, at(2), RULES);
  });

  it("merges two lobbies that invited each other after the fact, keeping the older one and its host", async () => {
    await befriend(bob, dave);
    const { match: older } = await createMatch(alice, [bob], at(10), RULES);
    const { match: newer } = await createMatch(bob, [dave], at(11), RULES);
    expect(newer.id).not.toBe(older.id);
    // The race the merge guards against: Alice ends up invited into Bob's lobby too.
    const [aliceRow] = await getDb()
      .select()
      .from(arenaPlayers)
      .where(and(eq(arenaPlayers.matchId, older.id), eq(arenaPlayers.userId, alice)));
    await getDb().insert(arenaPlayers).values({ matchId: newer.id, userId: alice, creatureId: aliceRow.creatureId, marker: aliceRow.marker, status: "invited", hp: 30, createdAt: at(11) });
    const bobView = await snapshot(bob, newer.id, at(12), RULES);
    expect(bobView.match.status).toBe("cancelled");
    expect(bobView.match.mergedInto).toBe(older.id);
    const aliceView = await snapshot(alice, older.id, at(13), RULES);
    expect(aliceView.match.hostId).toBe(alice);
    expect(Object.fromEntries(aliceView.players.map((p) => [p.userId, p.status]))).toEqual({ [alice]: "ready", [bob]: "ready", [dave]: "invited" });
    expect(await listArenaInvites(dave, at(13))).toMatchObject([{ matchId: older.id, hostName: "Alice" }]);
    expect(await listArenaInvites(alice, at(13))).toEqual([]);
    await cancelMatch(alice, older.id, at(14), RULES);
  });

  it("forgets a lobby nobody started", async () => {
    const { match } = await createMatch(alice, [bob], T0, RULES);
    const later = at(ARENA.lobbyTtlMinutes * 60 + 1);
    expect((await snapshot(alice, match.id, later, RULES)).match.status).toBe("cancelled");
    await expect(respondToInvite(bob, match.id, true, later, RULES)).rejects.toMatchObject({ code: "arena_closed" });
  });
});

describe("battle", () => {
  let matchId: string;

  it("starts once a friend joined, with everybody at full health", async () => {
    const { match } = await createMatch(alice, [bob], T0, RULES);
    matchId = match.id;
    const joined = await respondToInvite(bob, matchId, true, at(2), RULES);
    expect(joined.me?.status).toBe("ready");
    await expect(respondToInvite(bob, matchId, true, at(2), RULES)).rejects.toMatchObject({ code: "already_answered" });
    await expect(startMatch(alice, matchId, at(3), RULES)).rejects.toMatchObject({ code: "stakes_not_agreed" });
    await agreeAll(matchId, [alice, bob], at(4));
    const started = await startMatch(alice, matchId, at(5), RULES);
    expect(started.match.status).toBe("playing");
    expect(started.match.secondsLeft).toBe(120);
    expect(started.players.map((p) => p.hp)).toEqual([30, 30]);
    await expect(leaveMatch(dave, matchId, at(5), RULES)).rejects.toMatchObject({ code: "not_found" });
  });

  it("drops good foods on the table over time, one at a time, near a standing creature", async () => {
    const before = await snapshot(alice, matchId, at(6), RULES, { since: 0 });
    expect(before.bonuses).toEqual([]);
    const first = await snapshot(alice, matchId, at(5 + ARENA.firstBonusSeconds), RULES, { since: 0 });
    expect(first.bonuses).toHaveLength(1);
    expect([alice, bob]).toContain(first.bonuses[0].anchorUserId);
    const again = await snapshot(bob, matchId, at(5 + ARENA.firstBonusSeconds + 1), RULES, { since: 0 });
    expect(again.bonuses).toHaveLength(1);
    const gone = await snapshot(bob, matchId, at(5 + ARENA.firstBonusSeconds + ARENA.bonusStaySeconds + 0.1), RULES, { since: 0 });
    expect(gone.bonuses).toHaveLength(0);
  });

  it("relays WebRTC signals to their addressee only, outside the snapshots", async () => {
    const t = 5 + ARENA.firstBonusSeconds + 1.5;
    const before = await snapshot(bob, matchId, at(t), RULES, { since: 0 });
    await postSignal(alice, matchId, bob, { type: "hello", session: "s-alice" }, at(t + 0.1));
    await postSignal(bob, matchId, alice, { type: "offer", session: "s-bob", sdp: "v=0" }, at(t + 0.2));
    await expect(postSignal(alice, matchId, alice, { type: "hello", session: "x" }, at(t))).rejects.toMatchObject({ code: "not_found" });
    await expect(postSignal(alice, matchId, dave, { type: "hello", session: "x" }, at(t))).rejects.toMatchObject({ code: "not_found" });
    await expect(listSignals(dave, matchId, 0)).rejects.toMatchObject({ code: "not_found" });
    const forBob = await listSignals(bob, matchId, 0);
    expect(forBob.signals.map((s) => [s.from, s.payload])).toEqual([[alice, { type: "hello", session: "s-alice" }]]);
    const forAlice = await listSignals(alice, matchId, 0);
    expect(forAlice.signals.map((s) => s.payload)).toEqual([{ type: "offer", session: "s-bob", sdp: "v=0" }]);
    expect(forAlice.cursor).toBeGreaterThan(0);
    expect((await listSignals(alice, matchId, forAlice.cursor)).signals).toEqual([]);
    // Signals never reach the game events.
    const after = await snapshot(bob, matchId, at(t + 0.3), RULES, { since: before.cursor });
    expect(after.events.filter((e) => e.kind === "signal")).toEqual([]);
  });

  it("counts eggs with a cadence, damages the target and replays the shots as events", async () => {
    const t = 5 + ARENA.firstBonusSeconds + ARENA.bonusEverySeconds - 1;
    const miss = await recordShot(alice, matchId, { targetUserId: bob, x: 0.9, y: 0.4, hit: false }, at(t));
    expect(miss).toMatchObject({ accepted: true, hit: false, targetHp: 30 });
    const tooFast = await recordShot(alice, matchId, { targetUserId: bob, x: 0.1, y: 0, hit: true }, at(t + 0.1));
    expect(tooFast.accepted).toBe(false);
    const hit = await recordShot(alice, matchId, { targetUserId: bob, x: 0.1, y: 0, hit: true, nonce: "egg-1" }, at(t + 0.5));
    expect(hit).toMatchObject({ accepted: true, hit: true, targetHp: 20, eliminated: false });
    // Shooting yourself never counts as a hit.
    const self = await recordShot(alice, matchId, { targetUserId: alice, x: 0, y: 0, hit: true }, at(t + 1));
    expect(self.hit).toBe(false);

    const view = await snapshot(bob, matchId, at(t + 1.5), RULES, { since: 0 });
    const bobRow = view.players.find((p) => p.userId === bob)!;
    expect(bobRow.hp).toBe(20);
    expect(bobRow.hitsTaken).toBe(1);
    const aliceRow = view.players.find((p) => p.userId === alice)!;
    expect(aliceRow.shots).toBe(3);
    expect(aliceRow.hitsDealt).toBe(1);
    const eggs = view.events.filter((e) => e.kind === "egg");
    expect(eggs.map((e) => e.payload.hit)).toEqual([false, true, false]);
    expect(eggs[1].payload).toMatchObject({ target: bob, hp: 20, nonce: "egg-1" });
    expect(eggs[0].payload).not.toHaveProperty("nonce");
    // Only the news after the cursor comes back next time.
    const next = await snapshot(bob, matchId, at(t + 1.6), RULES, { since: view.cursor });
    expect(next.events).toEqual([]);
    expect(next.cursor).toBe(view.cursor);
  });

  it("heals with the tongue, each good food only once, capped at the match maximum", async () => {
    const t = 5 + ARENA.firstBonusSeconds + ARENA.bonusEverySeconds + 0.5;
    const view = await snapshot(bob, matchId, at(t), RULES, { since: 0 });
    expect(view.bonuses).toHaveLength(1);
    const bonus = view.bonuses[0];
    const eaten = await eatBonuses(bob, matchId, { bonusIds: [bonus.id, "00000000-0000-0000-0000-000000000000"], angle: 0.3, length: 1.5, nonce: "lick-1" }, at(t + 0.2));
    expect(eaten.eaten.map((b) => b.id)).toEqual([bonus.id]);
    expect(eaten.healed).toBe(Math.min(bonus.heal, 10));
    expect(eaten.hp).toBe(20 + eaten.healed);
    const twice = await eatBonuses(alice, matchId, { bonusIds: [bonus.id], angle: 0, length: 1 }, at(t + 0.3));
    expect(twice.eaten).toEqual([]);
    expect(twice.healed).toBe(0);
    const [row] = await getDb().select().from(arenaBonuses).where(eq(arenaBonuses.id, bonus.id));
    expect(row.eatenBy).toBe(bob);
    const after = await snapshot(alice, matchId, at(t + 0.4), RULES, { since: view.cursor });
    expect(after.bonuses).toEqual([]);
    const tongue = after.events.find((e) => e.kind === "tongue");
    expect(tongue?.actorId).toBe(bob);
    expect(tongue?.payload).toMatchObject({ angle: 0.3, length: 1.5, bonusIds: [bonus.id], nonce: "lick-1" });
  });

  it("ends when a single creature stands, ranks everybody and rewards each player once", async () => {
    const t = 40;
    let hp = (await snapshot(bob, matchId, at(t), RULES, { since: 0 })).me!.hp;
    let step = 0;
    while (hp > 0) {
      const shot = await recordShot(alice, matchId, { targetUserId: bob, x: 0, y: 0, hit: true }, at(t + step));
      expect(shot.accepted).toBe(true);
      hp = shot.targetHp ?? 0;
      step += 1;
    }
    const finished = await snapshot(alice, matchId, at(t + step), RULES, { since: 0 });
    expect(finished.match.status).toBe("finished");
    expect(finished.events.some((e) => e.kind === "eliminated" && e.actorId === bob)).toBe(true);
    expect(finished.events.at(-1)).toMatchObject({ kind: "finish", payload: { reason: "last_standing" } });
    const ranks = Object.fromEntries(finished.players.map((p) => [p.userId, p.rank]));
    expect(ranks).toEqual({ [alice]: 1, [bob]: 2 });
    expect(finished.me?.reward).toMatchObject({ score: 100, perfect: true });
    await expect(recordShot(alice, matchId, { targetUserId: bob, x: 0, y: 0, hit: true }, at(t + step + 1))).rejects.toMatchObject({ code: "arena_over" });

    const bobView = await snapshot(bob, matchId, at(t + step + 1), RULES);
    expect(bobView.me?.reward).toMatchObject({ score: 0, perfect: false });
    const sessions = await getDb().select().from(playSessions).where(eq(playSessions.kind, "arena"));
    expect(sessions).toHaveLength(2);
    // Reading again never rewards twice.
    await snapshot(alice, matchId, at(t + step + 2), RULES);
    expect(await getDb().select().from(playSessions).where(eq(playSessions.kind, "arena"))).toHaveLength(2);
    const listing = await listMatchesFor(alice, at(t + step + 3), RULES);
    expect(listing.open).toEqual([]);
    expect(listing.recent.map((s) => s.match.id)).toContain(matchId);
  });

  it("ends when time is up, ranking the survivors by health", async () => {
    const { match } = await createMatch(alice, [bob], at(100), RULES);
    await respondToInvite(bob, match.id, true, at(101), RULES);
    await agreeAll(match.id, [alice, bob], at(101.5));
    await startMatch(alice, match.id, at(102), RULES);
    await recordShot(bob, match.id, { targetUserId: alice, x: 0, y: 0, hit: true }, at(110));
    const running = await snapshot(alice, match.id, at(221), RULES, { since: 0 });
    expect(running.match.status).toBe("playing");
    expect(running.match.secondsLeft).toBe(1);
    const over = await snapshot(alice, match.id, at(222.5), RULES, { since: 0 });
    expect(over.match.status).toBe("finished");
    expect(over.match.finishedAt).toBe(at(222).toISOString());
    expect(over.events.at(-1)?.payload).toEqual({ reason: "time" });
    const ranks = Object.fromEntries(over.players.map((p) => [p.userId, p.rank]));
    expect(ranks).toEqual({ [alice]: 2, [bob]: 1 });
    expect(over.me?.reward).toMatchObject({ score: Math.round((50 * 20) / 30), perfect: false });
    // Two arena games today plus this one: the daily limit is reached, the reward is skipped honestly.
    const bobView = await snapshot(bob, match.id, at(223), RULES);
    expect(bobView.me?.reward).toMatchObject({ score: 100, perfect: true });
    const { match: third } = await createMatch(alice, [bob], at(300), RULES);
    await respondToInvite(bob, third.id, true, at(301), RULES);
    await agreeAll(third.id, [alice, bob], at(301.5));
    await startMatch(alice, third.id, at(302), RULES);
    const left = await leaveMatch(bob, third.id, at(310), RULES);
    expect(left.match.status).toBe("finished");
    expect(left.me?.status).toBe("left");
    expect(left.me?.reward).toEqual({ skipped: "left" });
    // Alice plays the food catch before opening the results: her third game of the day is spent, the arena reward is skipped honestly.
    await recordPlay(alice, (await getActiveCreature(alice))!, 50, at(310.5), {}, RULES);
    const aliceThird = await snapshot(alice, third.id, at(311), RULES);
    expect(aliceThird.me?.reward).toEqual({ skipped: "play_limit" });
    await expect(createMatch(alice, [bob], at(320), RULES)).rejects.toMatchObject({ code: "play_limit" });
    const [row] = await getDb().select().from(arenaMatches).where(eq(arenaMatches.id, third.id));
    expect(row.status).toBe("finished");
    const players = await getDb().select().from(arenaPlayers).where(eq(arenaPlayers.matchId, third.id));
    expect(players.every((p) => p.rewardedAt !== null)).toBe(true);
  });
});

describe("Défendre à deux", () => {
  it("runs a cooperative battle: the host publishes its simulation, partners relay their moves, the team is scored once", async () => {
    const t0 = 90_000; // the next game day: the daily play limit starts afresh
    const { match } = await createMatch(alice, [bob], at(t0), RULES, { mode: "coop" });
    expect(match.mode).toBe("coop");
    expect(match.seed).toBeGreaterThan(0);
    expect((await listArenaInvites(bob, at(t0))).map((n) => n.mode)).toEqual(["coop"]);
    // Cross invitations only unite lobbies of the same mode.
    await expect(createMatch(bob, [alice], at(t0 + 1), RULES, { mode: "arena" })).resolves.toMatchObject({ match: { mode: "arena" } });
    const listing = await listMatchesFor(bob, at(t0 + 2), RULES);
    expect(listing.open.map((s) => s.match.mode)).toEqual(["arena"]);
    await cancelMatch(bob, listing.open[0].match.id, at(t0 + 3), RULES);
    await respondToInvite(bob, match.id, true, at(t0 + 4), RULES);
    const started = await startMatch(alice, match.id, at(t0 + 5), RULES);
    expect(started.match.mode).toBe("coop");
    expect(started.match.coop).toEqual({ live: null, liveAt: null, result: null });
    expect(started.match.secondsLeft).toBe(1200);
    // The host's simulation is stored for the phones that poll; a guest cannot publish one.
    const state = createDefense(RULES.defense);
    startDefense(state);
    const random = coopRandom(match.seed, 0);
    const live = { hostTime: 123, states: { [alice]: { state: serializeDefense(state), rng: random.state() } } };
    await storeMatchState(alice, match.id, live, at(t0 + 6));
    await expect(storeMatchState(bob, match.id, live, at(t0 + 6))).rejects.toMatchObject({ code: "forbidden" });
    await expect(storeMatchState(alice, match.id, { nope: true }, at(t0 + 6))).rejects.toMatchObject({ code: "validation_error" });
    const bobView = await snapshot(bob, match.id, at(t0 + 7), RULES, { since: 0 });
    expect(bobView.match.coop?.live?.hostTime).toBe(123);
    expect(bobView.match.coop?.live?.states[alice].rng).toBe(random.state());
    expect(bobView.match.coop?.liveAt).toBe(at(t0 + 6).toISOString());
    expect(bobView.bonuses).toEqual([]);
    // Partners' moves travel through the event log.
    await logMatchEvent(bob, match.id, "smash", { frame: alice, hits: [3], x: 0.4, y: 0.1, nonce: "s1" }, at(t0 + 8));
    await expect(logMatchEvent(dave, match.id, "fire", {}, at(t0 + 8))).rejects.toMatchObject({ code: "not_found" });
    const aliceView = await snapshot(alice, match.id, at(t0 + 9), RULES, { since: 0 });
    expect(aliceView.events.some((e) => e.kind === "smash" && e.actorId === bob && e.payload.nonce === "s1")).toBe(true);
    // The team is scored from each creature's summary; every ready player gets the same reward.
    const summary = { spawned: 10, destroyed: 8, reached: 2, wavesCleared: 3, shots: 12, bosses: 1, goodEaten: 1, healed: 10, junkEaten: 0, goodWasted: 0 };
    const done = await finishCoop(alice, match.id, { [alice]: summary, [bob]: { ...summary, destroyed: 10, reached: 0 } }, at(t0 + 10), RULES);
    expect(done.match.status).toBe("finished");
    expect(done.match.coop?.result?.score).toBe(90);
    expect(done.match.coop?.result?.perfect).toBe(false);
    expect(done.me?.reward).toMatchObject({ score: 90 });
    await expect(finishCoop(bob, match.id, { [bob]: summary }, at(t0 + 11), RULES)).rejects.toMatchObject({ code: "arena_over" });
    const bobDone = await snapshot(bob, match.id, at(t0 + 12), RULES);
    expect(bobDone.me?.reward).toMatchObject({ score: 90 });
    expect(bobDone.players.map((p) => p.rank)).toEqual([1, 1]);
    const sessions = await getDb().select().from(playSessions).where(eq(playSessions.kind, "coop"));
    expect(sessions).toHaveLength(2);
  });
});


describe("mises", () => {
  const qtyOf = async (userId: string, accessoryId: string) => {
    const [row] = await getDb().select().from(userAccessories).where(and(eq(userAccessories.userId, userId), eq(userAccessories.accessoryId, accessoryId)));
    return row ? row.qty : null;
  };

  it("lets ready players bet accessories, asks everybody to validate the pot again after a change, and refuses to start before", async () => {
    const t0 = 180_000; // two game days later: fresh daily play limits
    await addAccessoryCopies(alice, "beret");
    await addAccessoryCopies(bob, "scarf");
    await addAccessoryCopies(bob, "monocle", 2);
    const pipo = (await getActiveCreature(bob))!;
    await equipAccessory(bob, pipo, "neck", "scarf");
    const { match } = await createMatch(alice, [bob], at(t0), RULES);
    const opened = await snapshot(alice, match.id, at(t0 + 1), RULES);
    expect(opened.match.stakes).toEqual({ enabled: true, agreed: false, waitingFor: ["toi"], pot: 0, winnerId: null });
    expect(opened.collection?.map((c) => c.accessoryId)).toEqual(["beret"]);
    expect(opened.collection?.[0]).toMatchObject({ name: "Béret", slot: "head", rarity: "commun", qty: 1, equipped: false });
    // Only a player who joined may bet, only what they own, only in a competitive mode.
    await expect(setStake(bob, match.id, "scarf", true, at(t0 + 2), RULES)).rejects.toMatchObject({ code: "not_ready" });
    await respondToInvite(bob, match.id, true, at(t0 + 3), RULES);
    await expect(setStake(alice, match.id, "monocle", true, at(t0 + 4), RULES)).rejects.toMatchObject({ code: "not_owned" });
    await expect(setStake(alice, match.id, "nope", true, at(t0 + 4), RULES)).rejects.toMatchObject({ code: "unknown_accessory" });
    await setStake(alice, match.id, "beret", true, at(t0 + 5), RULES);
    const bobView = await setStake(bob, match.id, "scarf", true, at(t0 + 6), RULES);
    expect(bobView.collection?.find((c) => c.accessoryId === "scarf")?.equipped).toBe(true);
    await setStake(bob, match.id, "monocle", true, at(t0 + 7), RULES);
    let view = await agreeStakes(alice, match.id, at(t0 + 8), RULES);
    expect(view.me?.agreed).toBe(true);
    expect(view.match.stakes).toMatchObject({ agreed: false, waitingFor: ["Bob"], pot: 3 });
    expect(view.players.map((p) => p.stakes.map((st) => st.accessoryId))).toEqual([["beret"], ["scarf", "monocle"]]);
    await expect(startMatch(alice, match.id, at(t0 + 9), RULES)).rejects.toMatchObject({ code: "stakes_not_agreed" });
    view = await agreeStakes(bob, match.id, at(t0 + 10), RULES);
    expect(view.match.stakes).toMatchObject({ agreed: true, waitingFor: [] });
    // Bob takes the monocle back: the pot changed, both validate again.
    view = await setStake(bob, match.id, "monocle", false, at(t0 + 11), RULES);
    expect(view.match.stakes).toMatchObject({ agreed: false, waitingFor: ["Alice", "toi"], pot: 2 });
    expect(view.players.every((p) => !p.agreed)).toBe(true);
    await agreeAll(match.id, [alice, bob], at(t0 + 12));
    // The start takes the copies (the creature keeps wearing the scarf during the battle).
    const started = await startMatch(alice, match.id, at(t0 + 13), RULES);
    expect(started.match.status).toBe("playing");
    expect(await qtyOf(alice, "beret")).toBe(0);
    expect(await qtyOf(bob, "scarf")).toBe(0);
    expect(await qtyOf(bob, "monocle")).toBe(2);
    expect((await getOutfit(pipo.id)).neck).toBe("scarf");
    expect(started.players[1].creature?.accessories).toEqual([{ slot: "neck", id: "scarf" }]);
    await expect(setStake(alice, match.id, "beret", false, at(t0 + 14), RULES)).rejects.toMatchObject({ code: "arena_closed" });
    // Alice knocks Pipo out: she takes the pot, Bob's creature loses its scarf.
    let hp = 30;
    let step = 0;
    while (hp > 0) {
      const shot = await recordShot(alice, match.id, { targetUserId: bob, x: 0, y: 0, hit: true }, at(t0 + 20 + step));
      hp = shot.targetHp ?? 0;
      step += 1;
    }
    const done = await snapshot(alice, match.id, at(t0 + 30), RULES, { since: 0 });
    expect(done.match.status).toBe("finished");
    expect(done.match.stakes).toMatchObject({ winnerId: alice, pot: 2 });
    expect(done.events.some((e) => e.kind === "stakes" && e.payload.winnerId === alice && e.payload.count === 1)).toBe(true);
    expect(await qtyOf(alice, "beret")).toBe(1);
    expect(await qtyOf(alice, "scarf")).toBe(1);
    expect(await qtyOf(bob, "scarf")).toBeNull();
    expect((await getOutfit(pipo.id)).neck).toBeUndefined();
    expect((await getOwnedAccessories(bob)).map((o) => o.accessory.id)).toEqual(["monocle"]);
    // Reading again (by anybody) never pays twice.
    await snapshot(bob, match.id, at(t0 + 31), RULES);
    expect(await qtyOf(alice, "scarf")).toBe(1);
    const rows = await getDb().select().from(arenaStakes).where(eq(arenaStakes.matchId, match.id));
    expect(rows.map((r) => [r.accessoryId, r.winnerId]).sort()).toEqual([
      ["beret", alice],
      ["scarf", alice],
    ]);
  });

  it("gives everybody their stake back on a tie, forgets the stakes of a player leaving the lobby, and refuses stakes in coop", async () => {
    const t0 = 180_100;
    await addAccessoryCopies(bob, "nightcap");
    const { match } = await createMatch(alice, [bob], at(t0), RULES);
    await respondToInvite(bob, match.id, true, at(t0 + 1), RULES);
    await setStake(bob, match.id, "nightcap", true, at(t0 + 2), RULES);
    await agreeAll(match.id, [alice, bob], at(t0 + 3));
    // Bob leaves the lobby: his stake goes away and Alice validates again; the host then closes the lobby.
    await leaveMatch(bob, match.id, at(t0 + 4), RULES);
    const after = await snapshot(alice, match.id, at(t0 + 5), RULES);
    expect(after.match.stakes).toMatchObject({ pot: 0, agreed: false, waitingFor: ["toi"] });
    expect(await qtyOf(bob, "nightcap")).toBe(1);
    await cancelMatch(alice, match.id, at(t0 + 6), RULES);
    // A tie on time: each one gets their own copy back.
    const { match: tie } = await createMatch(alice, [bob], at(t0 + 10), RULES);
    await respondToInvite(bob, tie.id, true, at(t0 + 11), RULES);
    await setStake(alice, tie.id, "beret", true, at(t0 + 12), RULES);
    await setStake(alice, tie.id, "scarf", true, at(t0 + 12), RULES);
    await setStake(bob, tie.id, "nightcap", true, at(t0 + 13), RULES);
    await agreeAll(tie.id, [alice, bob], at(t0 + 14));
    await startMatch(alice, tie.id, at(t0 + 15), RULES);
    expect(await qtyOf(alice, "beret")).toBe(0);
    expect(await qtyOf(bob, "nightcap")).toBe(0);
    const over = await snapshot(bob, tie.id, at(t0 + 15 + 121), RULES, { since: 0 });
    expect(over.match.status).toBe("finished");
    expect(over.players.map((p) => p.rank)).toEqual([1, 1]);
    expect(over.match.stakes).toMatchObject({ winnerId: null, pot: 3 });
    expect(await qtyOf(alice, "beret")).toBe(1);
    expect(await qtyOf(alice, "scarf")).toBe(1);
    expect(await qtyOf(bob, "nightcap")).toBe(1);
    // Leaving a battle loses the stake to the one who stays.
    const { match: quit } = await createMatch(alice, [bob], at(t0 + 200), RULES);
    await respondToInvite(bob, quit.id, true, at(t0 + 201), RULES);
    await setStake(bob, quit.id, "nightcap", true, at(t0 + 202), RULES);
    await agreeAll(quit.id, [alice, bob], at(t0 + 203));
    await startMatch(alice, quit.id, at(t0 + 204), RULES);
    const left = await leaveMatch(bob, quit.id, at(t0 + 210), RULES);
    expect(left.match.status).toBe("finished");
    expect(left.match.stakes).toMatchObject({ winnerId: alice, pot: 1 });
    expect(await qtyOf(alice, "nightcap")).toBe(1);
    expect(await qtyOf(bob, "nightcap")).toBeNull();
    // Coop: nothing to bet.
    const { match: coop } = await createMatch(alice, [bob], at(t0 + 300), RULES, { mode: "coop" });
    expect((await snapshot(alice, coop.id, at(t0 + 301), RULES)).match.stakes).toEqual({ enabled: false, agreed: false, waitingFor: [], pot: 0, winnerId: null });
    await expect(setStake(alice, coop.id, "beret", true, at(t0 + 302), RULES)).rejects.toMatchObject({ code: "no_stakes" });
    await expect(agreeStakes(alice, coop.id, at(t0 + 302), RULES)).rejects.toMatchObject({ code: "no_stakes" });
    await cancelMatch(alice, coop.id, at(t0 + 303), RULES);
  });
});

describe("ping-pong", () => {
  const qtyOf = async (userId: string, accessoryId: string) => {
    const [row] = await getDb().select().from(userAccessories).where(and(eq(userAccessories.userId, userId), eq(userAccessories.accessoryId, accessoryId)));
    return row ? row.qty : null;
  };

  it("plays a duel: two players only, the host publishes the rally, swings are relayed, the leader wins the points and the pot", async () => {
    const t0 = 270_000; // three game days later: fresh daily play limits
    await expect(createMatch(alice, [bob, carol], at(t0), RULES, { mode: "pingpong" })).rejects.toMatchObject({ code: "too_many" });
    const { match } = await createMatch(alice, [bob], at(t0), RULES, { mode: "pingpong" });
    expect(match.mode).toBe("pingpong");
    const opened = await snapshot(alice, match.id, at(t0 + 1), RULES);
    expect(opened.match.pingpong).toEqual({ live: null, liveAt: null, result: null, rules: DEFAULT_RULES.pingpong });
    expect(opened.match.stakes.enabled).toBe(true);
    expect((await listArenaInvites(bob, at(t0 + 1))).map((n) => n.mode)).toEqual(["pingpong"]);
    await respondToInvite(bob, match.id, true, at(t0 + 2), RULES);
    await addAccessoryCopies(bob, "beanie");
    await setStake(bob, match.id, "beanie", true, at(t0 + 3), RULES);
    await agreeAll(match.id, [alice, bob], at(t0 + 4));
    const started = await startMatch(alice, match.id, at(t0 + 5), RULES);
    expect(started.match.status).toBe("playing");
    expect(started.match.secondsLeft).toBe(300);
    expect(await qtyOf(bob, "beanie")).toBe(0);
    // The host publishes the rally state; a guest cannot, and a coop state is refused here.
    const state = createPingPong([alice, bob], at(t0 + 5).getTime());
    servePingPong(state, alice, at(t0 + 6).getTime());
    await storeMatchState(alice, match.id, { hostTime: 1, state: serializePingPong(state) }, at(t0 + 6));
    await expect(storeMatchState(bob, match.id, { hostTime: 1, state: serializePingPong(state) }, at(t0 + 6))).rejects.toMatchObject({ code: "forbidden" });
    await expect(storeMatchState(alice, match.id, { hostTime: 1, states: {} }, at(t0 + 6))).rejects.toMatchObject({ code: "validation_error" });
    const bobView = await snapshot(bob, match.id, at(t0 + 7), RULES, { since: 0 });
    expect(bobView.match.pingpong?.live?.state.flight).toMatchObject({ id: 1, from: alice, to: bob });
    expect(bobView.match.pingpong?.liveAt).toBe(at(t0 + 6).toISOString());
    expect(bobView.bonuses).toEqual([]);
    // Swings and serves travel through the event log for the phones without a direct link.
    await logMatchEvent(bob, match.id, "swing", { flightId: 1, at: 123, nonce: "w1" }, at(t0 + 8));
    const aliceView = await snapshot(alice, match.id, at(t0 + 9), RULES, { since: 0 });
    expect(aliceView.events.some((e) => e.kind === "swing" && e.actorId === bob && e.payload.flightId === 1)).toBe(true);
    // Any ready player may report the end; the leader wins, takes the pot, both are rewarded once.
    await expect(finishCoop(alice, match.id, {}, at(t0 + 30), RULES)).rejects.toMatchObject({ code: "not_coop" });
    const done = await finishPingPong(bob, match.id, { points: { [alice]: 7, [bob]: 4 }, longestRally: 5 }, at(t0 + 40), RULES);
    expect(done.match.status).toBe("finished");
    expect(done.match.pingpong?.result).toMatchObject({ winnerId: alice, points: { [alice]: 7, [bob]: 4 }, longestRally: 5 });
    expect(done.players.map((p) => [p.rank, p.points])).toEqual([
      [1, 7],
      [2, 4],
    ]);
    expect(done.me?.reward).toMatchObject({ score: pingpongScore(4, 7, false).score, perfect: false });
    expect(done.match.stakes).toMatchObject({ winnerId: alice, pot: 1 });
    expect(await qtyOf(alice, "beanie")).toBe(1);
    expect(await qtyOf(bob, "beanie")).toBeNull();
    await expect(finishPingPong(alice, match.id, { points: { [alice]: 0, [bob]: 9 } }, at(t0 + 41), RULES)).rejects.toMatchObject({ code: "arena_over" });
    const aliceDone = await snapshot(alice, match.id, at(t0 + 42), RULES);
    expect(aliceDone.me?.reward).toMatchObject({ score: pingpongScore(7, 4, true).score, perfect: false });
    expect(await getDb().select().from(playSessions).where(eq(playSessions.kind, "pingpong"))).toHaveLength(2);
    // A tie: both first, each keeps their own stake.
    const { match: tie } = await createMatch(bob, [alice], at(t0 + 100), RULES, { mode: "pingpong" });
    await respondToInvite(alice, tie.id, true, at(t0 + 101), RULES);
    await setStake(alice, tie.id, "beanie", true, at(t0 + 102), RULES);
    await agreeAll(tie.id, [alice, bob], at(t0 + 103));
    await startMatch(bob, tie.id, at(t0 + 104), RULES);
    const even = await finishPingPong(bob, tie.id, { points: { [alice]: 3, [bob]: 3 } }, at(t0 + 130), RULES);
    expect(even.match.pingpong?.result?.winnerId).toBeNull();
    expect(even.players.map((p) => p.rank)).toEqual([1, 1]);
    expect(even.match.stakes).toMatchObject({ winnerId: null, pot: 1 });
    expect(await qtyOf(alice, "beanie")).toBe(1);
    expect(even.me?.reward).toMatchObject({ score: 50 });
  });
});
