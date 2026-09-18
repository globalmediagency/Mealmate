import { describe, expect, it } from "vitest";
import { PINGPONG } from "./config";
import { ballProgress, concedePingPong, createPingPong, endPingPong, flightMs, hitPingPong, hitWindows, inHitWindow, parsePingPongState, pingpongScore, serializePingPong, servePingPong, tickPingPong, timingRingShown } from "./pingpong";
import { DEFAULT_RULES } from "./rules";

const A = "alice";
const B = "bob";
const R = DEFAULT_RULES.pingpong;

describe("ping-pong", () => {
  it("serves, returns the ball faster after each hit, and gives the point on a miss", () => {
    const s = createPingPong([A, B], 1000);
    expect(s.phase).toBe("serve");
    expect(s.server).toBe(A);
    expect(s.rules).toEqual(R);
    expect(servePingPong(s, B, 1000)).toBe(false);
    expect(servePingPong(s, A, 1000)).toBe(true);
    expect(s.flight).toMatchObject({ id: 1, from: A, to: B, launchedAt: 1000, arrivesAt: 1000 + R.firstFlightMs, pace: 0, quality: "serve", kind: "normal" });
    const serveWindow = hitWindows(s.flight!, R);
    expect(serveWindow).toEqual({ good: Math.round((R.firstFlightMs * R.goodWindowPercent) / 100), perfect: Math.round((R.firstFlightMs * R.perfectWindowPercent) / 100) });
    // Too early: the point goes to the sender.
    const early = createPingPong([A, B], 0);
    servePingPong(early, A, 0);
    expect(hitPingPong(early, B, 0)).toEqual({ ok: false, reason: "early" });
    expect(early.points).toEqual({ [A]: 1, [B]: 0 });
    expect(early.phase).toBe("point");
    expect(early.server).toBe(B);
    // A good hit sends the ball back at the next pace; a perfect one is a smash: two paces more and a shorter flight.
    const arrival = s.flight!.arrivesAt;
    expect(hitPingPong(s, A, arrival)).toEqual({ ok: false, reason: "not_receiver" });
    expect(hitPingPong(s, B, arrival + serveWindow.good - 1)).toEqual({ ok: true, quality: "good", offsetMs: serveWindow.good - 1, shot: "normal" });
    expect(s.flight).toMatchObject({ id: 2, from: B, to: A, launchedAt: arrival, pace: 1, kind: "normal" });
    expect(s.flight!.arrivesAt - s.flight!.launchedAt).toBe(flightMs(1, R));
    const second = s.flight!.arrivesAt;
    expect(hitPingPong(s, A, second - 30)).toEqual({ ok: true, quality: "perfect", offsetMs: -30, shot: "smash" });
    expect(s.flight).toMatchObject({ id: 3, from: A, to: B, pace: 3, kind: "smash" });
    expect(s.flight!.arrivesAt - s.flight!.launchedAt).toBe(flightMs(3, R, "smash"));
    expect(flightMs(3, R, "smash")).toBeLessThan(flightMs(3, R));
    expect(s.currentRally).toBe(2);
    expect(s.hits).toEqual({ [A]: 1, [B]: 1 });
    expect(s.perfects).toEqual({ [A]: 1, [B]: 0 });
    expect(s.recent.filter((e) => e.kind === "hit").map((e) => e.shot)).toEqual(["normal", "smash"]);
    // Nobody hits: after the window (plus the referee's grace) the point goes to the sender, the loser serves next.
    const third = s.flight!.arrivesAt;
    const smashWindow = hitWindows(s.flight!, R).good;
    tickPingPong(s, third + smashWindow, { graceFor: () => 500 });
    expect(s.phase).toBe("flight");
    tickPingPong(s, third + smashWindow + 501, { graceFor: () => 500 });
    expect(s.phase).toBe("point");
    expect(s.points).toEqual({ [A]: 1, [B]: 0 });
    expect(s.lastPoint).toMatchObject({ to: A, reason: "miss", rally: 2 });
    expect(s.longestRally).toBe(2);
    expect(s.server).toBe(B);
    expect(hitPingPong(s, B, third + 2000)).toEqual({ ok: false, reason: "phase" });
    tickPingPong(s, s.nextServeAt! + 1);
    expect(s.phase).toBe("serve");
    // A slow server is served for.
    tickPingPong(s, s.serveDueAt!);
    expect(s.phase).toBe("flight");
    expect(s.flight).toMatchObject({ from: B, to: A, quality: "serve" });
    expect(s.recent.map((e) => e.kind)).toContain("serve");
  });

  it("tightens the windows as the rally speeds up, down to the floors", () => {
    const s = createPingPong([A, B], 0);
    servePingPong(s, A, 0);
    const first = hitWindows(s.flight!, R);
    // Good hits, never perfect (a perfect return would be a smash, which has its own floor).
    for (let i = 0; i < 30; i += 1) {
      const f = s.flight!;
      expect(hitPingPong(s, f.to, f.arrivesAt + hitWindows(f, R).perfect + 1)).toMatchObject({ ok: true, quality: "good", shot: "normal" });
    }
    const fast = s.flight!;
    expect(fast.arrivesAt - fast.launchedAt).toBe(R.minFlightMs);
    const late = hitWindows(fast, R);
    expect(late.good).toBeLessThan(first.good);
    expect(late.good).toBe(Math.max(PINGPONG.minGoodMs, Math.round((R.minFlightMs * R.goodWindowPercent) / 100)));
    expect(late.perfect).toBe(Math.max(PINGPONG.minPerfectMs, Math.round((R.minFlightMs * R.perfectWindowPercent) / 100)));
    expect(inHitWindow(fast, fast.arrivesAt + late.good, R)).toBe(true);
    expect(inHitWindow(fast, fast.arrivesAt + late.good + 1, R)).toBe(false);
    // The floors hold whatever the admin sets.
    expect(flightMs(100, R)).toBe(R.minFlightMs);
    expect(flightMs(100, R, "smash")).toBeGreaterThanOrEqual(PINGPONG.smashMinMs);
    const custom = createPingPong([A, B], 0, 100_000, { ...R, goodWindowPercent: 40, minFlightMs: 2000, ringHideAfterHits: 0 });
    servePingPong(custom, A, 0);
    expect(hitWindows(custom.flight!, custom.rules).good).toBe(Math.round(R.firstFlightMs * 0.4));
  });

  it("lobs fly slow and high with the ring hidden on the way down; the ring disappears in long rallies", () => {
    const s = createPingPong([A, B], 0);
    servePingPong(s, A, 0);
    const arrival = s.flight!.arrivesAt;
    expect(timingRingShown(s, arrival - 10)).toBe(true);
    expect(hitPingPong(s, B, arrival + 5, "lob")).toMatchObject({ ok: true, quality: "perfect", shot: "lob" });
    const lob = s.flight!;
    expect(lob.kind).toBe("lob");
    expect(lob.arrivesAt - lob.launchedAt).toBe(flightMs(2, R, "lob"));
    expect(flightMs(2, R, "lob")).toBe(Math.round(flightMs(2, R) * R.lobFactor));
    const span = lob.arrivesAt - lob.launchedAt;
    expect(timingRingShown(s, lob.launchedAt + span * (1 - PINGPONG.lobHiddenTail) - 1)).toBe(true);
    expect(timingRingShown(s, lob.launchedAt + span * (1 - PINGPONG.lobHiddenTail) + 1)).toBe(false);
    // The window follows the (longer) lob flight.
    expect(hitWindows(lob, R).good).toBe(Math.max(PINGPONG.minGoodMs, Math.round((span * R.goodWindowPercent) / 100)));
    // Long rally: the ring goes away after `ringHideAfterHits` hits.
    for (let i = s.currentRally; i < R.ringHideAfterHits; i += 1) {
      expect(timingRingShown(s, s.flight!.launchedAt + 10)).toBe(true); // shown at launch, even on a lob
      hitPingPong(s, s.flight!.to, s.flight!.arrivesAt + 1);
    }
    expect(s.currentRally).toBe(R.ringHideAfterHits);
    expect(timingRingShown(s, s.flight!.launchedAt + 10)).toBe(false);
    expect(timingRingShown({ ...s, rules: { ...R, ringHideAfterHits: 0 } }, s.flight!.launchedAt + 10)).toBe(true);
    expect(timingRingShown({ ...s, phase: "point", flight: null }, 0)).toBe(false);
  });

  it("ends at the winning score, on the clock or when a player leaves", () => {
    const s = createPingPong([A, B], 0, 100_000);
    for (let i = 0; i < R.pointsToWin; i += 1) {
      tickPingPong(s, i * 5000 + 1); // opens the serve after the point pause
      if (s.phase === "point") tickPingPong(s, s.nextServeAt!);
      expect(servePingPong(s, s.server, i * 5000 + 10)).toBe(true);
      const receiver = s.flight!.to;
      if (receiver === B) {
        tickPingPong(s, s.flight!.arrivesAt + hitWindows(s.flight!, R).good + 1);
      } else {
        // B returns once, then A misses.
        hitPingPong(s, A, s.flight!.arrivesAt);
        tickPingPong(s, s.flight!.arrivesAt + hitWindows(s.flight!, R).good + 1);
      }
    }
    expect(s.phase).toBe("over");
    expect(s.winnerId).toBe(A);
    expect(s.points[A]).toBe(R.pointsToWin);
    expect(s.seq).toBeGreaterThan(0);
    const short = createPingPong([A, B], 0, 100_000, { ...R, pointsToWin: 1 });
    servePingPong(short, A, 0);
    tickPingPong(short, short.flight!.arrivesAt + 5000);
    expect(short).toMatchObject({ phase: "over", winnerId: A });
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

  it("places the ball on an arc, scores the reward, and round-trips through JSON with the rules and the kind of shot", () => {
    const s = createPingPong([A, B], 0, 100_000, { ...R, pointsToWin: 11 });
    servePingPong(s, A, 0);
    const f = s.flight!;
    expect(ballProgress(f, -10)).toEqual({ t: 0, lift: 0 });
    expect(ballProgress(f, f.arrivesAt / 2)).toEqual({ t: 0.5, lift: 1 });
    expect(ballProgress(f, f.arrivesAt + 10).t).toBe(1);
    expect(pingpongScore(7, 0, true)).toEqual({ score: 100, perfect: true });
    expect(pingpongScore(7, 5, true)).toEqual({ score: Math.round((50 * 7) / 12 + 50), perfect: false });
    expect(pingpongScore(3, 7, false)).toEqual({ score: 15, perfect: false });
    expect(pingpongScore(0, 0, null)).toEqual({ score: 50, perfect: false });
    hitPingPong(s, B, f.arrivesAt, "lob");
    s.recent.push({ kind: "serve", player: A, at: 0 });
    const copy = serializePingPong(s);
    expect(copy.recent).toEqual([]);
    expect(copy.rules.pointsToWin).toBe(11);
    expect(copy.flight?.kind).toBe("lob");
    const parsed = parsePingPongState({ hostTime: 123, state: copy });
    expect(parsed?.state.flight?.kind).toBe("lob");
    expect(parsed?.state.rules).toEqual({ ...R, pointsToWin: 11 });
    expect(parsed?.state.points).toEqual({ [A]: 0, [B]: 0 });
    // A state from an older phone, without rules or kind, still reads (defaults).
    const { rules: _rules, ...bare } = copy;
    void _rules;
    const old = parsePingPongState({ hostTime: 1, state: { ...bare, flight: { ...copy.flight, kind: undefined } } });
    expect(old?.state.rules).toEqual(R);
    expect(old?.state.flight?.kind).toBe("normal");
    expect(parsePingPongState({ hostTime: 1, state: { ...copy, rules: { pointsToWin: "x" } } })?.state.rules.pointsToWin).toBe(R.pointsToWin);
    expect(parsePingPongState({ hostTime: 1, state: { ...copy, players: [A] } })).toBeNull();
    expect(parsePingPongState({ hostTime: 1, state: { ...copy, flight: { id: "x" } } })).toBeNull();
    expect(parsePingPongState({ nope: true })).toBeNull();
  });
});
