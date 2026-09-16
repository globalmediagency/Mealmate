import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgg, getActiveCreature, hatchEgg, nameCreature } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { arenaBonuses, arenaMatches, arenaPlayers, playSessions, profiles } from "@/lib/db/schema";
import { acceptFriendRequest, listRequests, sendFriendRequest } from "@/lib/friends/service";
import { ARENA } from "@/lib/game/config";
import { DEFAULT_RULES, type GameRules } from "@/lib/game/rules";
import { gameDate } from "@/lib/game/time";
import { recordPlay } from "@/lib/play/service";
import { saveManualSteps } from "@/lib/steps/service";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import {
  cancelMatch,
  countArenaInvites,
  createMatch,
  eatBonuses,
  leaveMatch,
  listMatchesFor,
  recordShot,
  respondToInvite,
  snapshot,
  startMatch,
} from "./service";

let tdb: TestDatabase;
let alice: string;
let bob: string;
let carol: string;
let dave: string;
const T0 = new Date("2026-09-16T10:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const RULES: GameRules = { ...DEFAULT_RULES, arena: { hp: 30, eggDamage: 10, durationSeconds: 120, webrtc: false } };

async function befriend(a: string, b: string) {
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, b));
  await sendFriendRequest(a, profile.friendCode);
  const requests = await listRequests(b);
  await acceptFriendRequest(b, requests.incoming[0].id);
}

async function hatchNamed(userId: string, name: string) {
  await createEgg(userId, "facile");
  await saveManualSteps(userId, 15_000, await getActiveCreature(userId), gameDate(T0));
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

  it("counts eggs with a cadence, damages the target and replays the shots as events", async () => {
    const t = 5 + ARENA.firstBonusSeconds + ARENA.bonusEverySeconds - 1;
    const miss = await recordShot(alice, matchId, { targetUserId: bob, x: 0.9, y: 0.4, hit: false }, at(t));
    expect(miss).toMatchObject({ accepted: true, hit: false, targetHp: 30 });
    const tooFast = await recordShot(alice, matchId, { targetUserId: bob, x: 0.1, y: 0, hit: true }, at(t + 0.1));
    expect(tooFast.accepted).toBe(false);
    const hit = await recordShot(alice, matchId, { targetUserId: bob, x: 0.1, y: 0, hit: true }, at(t + 0.5));
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
    expect(eggs[1].payload).toMatchObject({ target: bob, hp: 20 });
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
    const eaten = await eatBonuses(bob, matchId, { bonusIds: [bonus.id, "00000000-0000-0000-0000-000000000000"], angle: 0.3, length: 1.5 }, at(t + 0.2));
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
    expect(tongue?.payload).toMatchObject({ angle: 0.3, length: 1.5, bonusIds: [bonus.id] });
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
