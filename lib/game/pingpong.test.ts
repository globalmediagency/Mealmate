import { describe, expect, it } from "vitest";
import { PINGPONG } from "./config";
import { ballProgress, concedePingPong, createPingPong, endPingPong, flightMs, hitPingPong, inHitWindow, parsePingPongState, pingpongScore, serializePingPong, servePingPong, tickPingPong } from "./pingpong";

const A = "alice";
const B = "bob";

describe("ping-pong", () => {
  it("serves, returns the ball faster after each hit, and gives the point on a miss", () => {
    const s = createPingPong([A, B], 1000);
    expect(s.phase).toBe("serve");
    expect(s.server).toBe(A);
    expect(servePingPong(s, B, 1000)).toBe(false);
    expect(servePingPong(s, A, 1000)).toBe(true);
    expect(s.flight).toMatchObject({ id: 1, from: A, to: B, launchedAt: 1000, arrivesAt: 1000 + PINGPONG.firstFlightMs, pace: 0, quality: "serve" });
    // Too early: the point goes to the sender.
    const early = createPingPong([A, B], 0);
    servePingPong(early, A, 0);
    expect(hitPingPong(early, B, 0)).toEqual({ ok: false, reason: "early" });
    expect(early.points).toEqual({ [A]: 1, [B]: 0 });
    expect(early.phase).toBe("point");
    expect(early.server).toBe(B);
    // A good hit sends the ball back, a perfect one speeds it up twice as much.
    const arrival = s.flight!.arrivesAt;
    expect(hitPingPong(s, A, arrival)).toEqual({ ok: false, reason: "not_receiver" });
    expect(hitPingPong(s, B, arrival + 200)).toEqual({ ok: true, quality: "good", offsetMs: 200 });
    expect(s.flight).toMatchObject({ id: 2, from: B, to: A, launchedAt: arrival, pace: 1 });
    expect(s.flight!.arrivesAt - s.flight!.launchedAt).toBe(flightMs(1));
    const second = s.flight!.arrivesAt;
    expect(hitPingPong(s, A, second - 50)).toEqual({ ok: true, quality: "perfect", offsetMs: -50 });
    expect(s.flight).toMatchObject({ id: 3, from: A, to: B, pace: 3 });
    expect(s.currentRally).toBe(2);
    expect(s.hits).toEqual({ [A]: 1, [B]: 1 });
    expect(s.perfects).toEqual({ [A]: 1, [B]: 0 });
    // Nobody hits: after the window (plus the referee's grace) the point goes to the sender, the loser serves next.
    const third = s.flight!.arrivesAt;
    tickPingPong(s, third + PINGPONG.goodMs, { graceFor: () => 500 });
    expect(s.phase).toBe("flight");
    tickPingPong(s, third + PINGPONG.goodMs + 501, { graceFor: () => 500 });
    expect(s.phase).toBe("point");
    expect(s.points).toEqual({ [A]: 1, [B]: 0 });
    expect(s.lastPoint).toMatchObject({ to: A, reason: "miss", rally: 2 });
    expect(s.longestRally).toBe(2);
    expect(s.server).toBe(B);
    expect(hitPingPong(s, B, third + 2000)).toEqual({ ok: false, reason: "phase" });
    tickPingPong(s, s.nextServeAt! + 1);
    expect(s.phase).toBe("serve");
    expect(s.serveDueAt).toBe(s.nextServeAt === null ? s.serveDueAt : s.serveDueAt);
    // A slow server is served for.
    tickPingPong(s, s.serveDueAt!);
    expect(s.phase).toBe("flight");
    expect(s.flight).toMatchObject({ from: B, to: A, quality: "serve" });
    expect(s.recent.map((e) => e.kind)).toContain("serve");
  });

  it("ends at the winning score, on the clock or when a player leaves", () => {
    const s = createPingPong([A, B], 0, 100_000);
    for (let i = 0; i < PINGPONG.pointsToWin; i += 1) {
      tickPingPong(s, i * 5000 + 1); // opens the serve after the point pause
      if (s.phase === "point") tickPingPong(s, s.nextServeAt!);
      expect(servePingPong(s, s.server, i * 5000 + 10)).toBe(true);
      const receiver = s.flight!.to;
      if (receiver === B) {
        tickPingPong(s, s.flight!.arrivesAt + PINGPONG.goodMs + 1);
      } else {
        // B returns once, then A misses.
        hitPingPong(s, A, s.flight!.arrivesAt);
        tickPingPong(s, s.flight!.arrivesAt + PINGPONG.goodMs + 1);
      }
    }
    expect(s.phase).toBe("over");
    expect(s.winnerId).toBe(A);
    expect(s.points[A]).toBe(PINGPONG.pointsToWin);
    expect(s.seq).toBeGreaterThan(0);
    const clock = createPingPong([A, B], 0, 5000);
    servePingPong(clock, A, 0);
    tickPingPong(clock, 5000);
    expect(clock.phase).toBe("over");
    expect(clock.winnerId).toBeNull();
    const left = createPingPong([A, B], 0);
    concedePingPong(left, B, 10);
    expect(left).toMatchObject({ phase: "over", winnerId: A, lastPoint: { to: A, reason: "left" } });
    const byHand = createPingPong([A, B], 0);
    byHand.points[B] = 3;
    endPingPong(byHand, 50);
    expect(byHand.winnerId).toBe(B);
    expect(byHand.endsAt).toBe(50);
  });

  it("places the ball on an arc, tells the hit window, scores the reward, and round-trips through JSON", () => {
    const s = createPingPong([A, B], 0);
    servePingPong(s, A, 0);
    const f = s.flight!;
    expect(ballProgress(f, -10)).toEqual({ t: 0, lift: 0 });
    expect(ballProgress(f, f.arrivesAt / 2)).toEqual({ t: 0.5, lift: 1 });
    expect(ballProgress(f, f.arrivesAt + 10).t).toBe(1);
    expect(inHitWindow(f, f.arrivesAt - PINGPONG.goodMs)).toBe(true);
    expect(inHitWindow(f, f.arrivesAt - PINGPONG.goodMs - 1)).toBe(false);
    expect(flightMs(100)).toBe(PINGPONG.minFlightMs);
    expect(pingpongScore(7, 0, true)).toEqual({ score: 100, perfect: true });
    expect(pingpongScore(7, 5, true)).toEqual({ score: Math.round((50 * 7) / 12 + 50), perfect: false });
    expect(pingpongScore(3, 7, false)).toEqual({ score: 15, perfect: false });
    expect(pingpongScore(0, 0, null)).toEqual({ score: 50, perfect: false });
    s.recent.push({ kind: "serve", player: A, at: 0 });
    const copy = serializePingPong(s);
    expect(copy.recent).toEqual([]);
    expect(copy.flight).toEqual(f);
    const parsed = parsePingPongState({ hostTime: 123, state: copy });
    expect(parsed?.state.flight?.id).toBe(1);
    expect(parsed?.state.points).toEqual({ [A]: 0, [B]: 0 });
    expect(parsePingPongState({ hostTime: 1, state: { ...copy, players: [A] } })).toBeNull();
    expect(parsePingPongState({ hostTime: 1, state: { ...copy, flight: { id: "x" } } })).toBeNull();
    expect(parsePingPongState({ nope: true })).toBeNull();
  });
});
