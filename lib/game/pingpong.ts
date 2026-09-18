/**
 * "Ping-pong" (spec § 3.25): two creatures on their own papers send a ball
 * back and forth; each player hits when the ball reaches their creature. Pure
 * and deterministic: every phone runs this state, the host's copy is the
 * truth and the guest predicts its own moves. Times are milliseconds on the
 * shared (server) clock. The admin rules (`rules.pingpong`) travel inside
 * the state so every phone judges with the same numbers.
 */
import { PINGPONG } from "./config";
import { DEFAULT_RULES, type PingPongRules } from "./rules";

export type HitQuality = "perfect" | "good";
export type PointReason = "miss" | "early" | "timeout" | "left";
export type PingPongPhase = "serve" | "flight" | "point" | "over";
/** What the player asks for: a plain hit (a smash when the timing is perfect) or a lob. */
export type PingPongShot = "normal" | "lob";
/** How the ball flies: normal, slow and high (lob), fast and flat (smash, after a perfect hit). */
export type FlightKind = "normal" | "lob" | "smash";

/** The ball in the air, from one creature to the other. */
export type Flight = {
  id: number;
  from: string;
  to: string;
  launchedAt: number;
  arrivesAt: number;
  /** Consecutive hits in the rally so far: the ball gets faster. */
  pace: number;
  quality: HitQuality | "serve";
  kind: FlightKind;
};

export type PingPongEffect = { kind: "serve" | "hit" | "miss" | "point"; player: string; quality?: HitQuality; shot?: FlightKind; reason?: PointReason; at: number };

export type PingPongState = {
  /** The host first. */
  players: [string, string];
  /** The admin rules the match plays with (frozen in the host's state). */
  rules: PingPongRules;
  points: Record<string, number>;
  /** Who serves the current or next point. */
  server: string;
  phase: PingPongPhase;
  flight: Flight | null;
  /** Serve phase: the ball is served for a player who waits longer than this. */
  serveDueAt: number | null;
  /** Point phase: when the next serve opens. */
  nextServeAt: number | null;
  lastPoint: { to: string; reason: PointReason; at: number; rally: number } | null;
  rallies: number;
  longestRally: number;
  currentRally: number;
  hits: Record<string, number>;
  perfects: Record<string, number>;
  misses: Record<string, number>;
  winnerId: string | null;
  startedAt: number;
  endsAt: number;
  nextFlightId: number;
  /** Bumped on every transition: a guest adopts the host's state only when the host is at least as far. */
  seq: number;
  /** Visual notes for the phone, drained by the scene (never published). */
  recent: PingPongEffect[];
};

export type HitOutcome = { ok: true; quality: HitQuality; offsetMs: number; shot: FlightKind } | { ok: false; reason: "phase" | "not_receiver" | "early" | "late" };

const MAX_RECENT = 8;

/** Flight time (ms) after `pace` consecutive hits, for a kind of shot: a lob flies longer, a smash shorter (never under `smashMinMs`). */
export function flightMs(pace: number, rules: PingPongRules = DEFAULT_RULES.pingpong, kind: FlightKind = "normal"): number {
  const base = Math.max(rules.minFlightMs, Math.round(rules.firstFlightMs * rules.paceFactor ** Math.max(0, pace)));
  if (kind === "lob") return Math.round(base * rules.lobFactor);
  if (kind === "smash") return Math.max(PINGPONG.smashMinMs, Math.round(base * rules.smashFactor));
  return base;
}

/** The timing windows (± ms around the arrival) of a flight: a share of its duration, never under the floors, so a fast rally demands precision. */
export function hitWindows(flight: Flight, rules: PingPongRules): { good: number; perfect: number } {
  const duration = Math.max(1, flight.arrivesAt - flight.launchedAt);
  return {
    good: Math.max(PINGPONG.minGoodMs, Math.round((duration * rules.goodWindowPercent) / 100)),
    perfect: Math.max(PINGPONG.minPerfectMs, Math.round((duration * rules.perfectWindowPercent) / 100)),
  };
}

const other = (state: PingPongState, userId: string): string => (state.players[0] === userId ? state.players[1] : state.players[0]);

function note(state: PingPongState, effect: PingPongEffect) {
  state.recent.push(effect);
  if (state.recent.length > MAX_RECENT) state.recent.shift();
}

export function createPingPong(players: [string, string], now: number, endsAt = now + PINGPONG.maxSeconds * 1000, rules: PingPongRules = DEFAULT_RULES.pingpong): PingPongState {
  const zero = { [players[0]]: 0, [players[1]]: 0 };
  return {
    players,
    rules: { ...rules },
    points: { ...zero },
    server: players[0],
    phase: "serve",
    flight: null,
    serveDueAt: now + PINGPONG.serveTimeoutMs,
    nextServeAt: null,
    lastPoint: null,
    rallies: 0,
    longestRally: 0,
    currentRally: 0,
    hits: { ...zero },
    perfects: { ...zero },
    misses: { ...zero },
    winnerId: null,
    startedAt: now,
    endsAt,
    nextFlightId: 1,
    seq: 0,
    recent: [],
  };
}

function launch(state: PingPongState, from: string, now: number, pace: number, quality: Flight["quality"], kind: FlightKind) {
  state.flight = { id: state.nextFlightId++, from, to: other(state, from), launchedAt: now, arrivesAt: now + flightMs(pace, state.rules, kind), pace, quality, kind };
  state.phase = "flight";
  state.serveDueAt = null;
  state.nextServeAt = null;
  state.seq += 1;
}

/** The server puts the ball in play (only in the serve phase, only the server). */
export function servePingPong(state: PingPongState, userId: string, now: number): boolean {
  if (state.phase !== "serve" || state.server !== userId) return false;
  launch(state, userId, now, 0, "serve", "normal");
  note(state, { kind: "serve", player: userId, at: now });
  return true;
}

function awardPoint(state: PingPongState, to: string, reason: PointReason, now: number) {
  state.points[to] = (state.points[to] ?? 0) + 1;
  state.rallies += 1;
  state.longestRally = Math.max(state.longestRally, state.currentRally);
  state.lastPoint = { to, reason, at: now, rally: state.currentRally };
  const loser = other(state, to);
  state.misses[loser] = (state.misses[loser] ?? 0) + 1;
  state.currentRally = 0;
  state.flight = null;
  state.server = loser;
  state.seq += 1;
  note(state, { kind: "point", player: to, reason, at: now });
  if (state.points[to] >= state.rules.pointsToWin) {
    state.phase = "over";
    state.winnerId = to;
    state.nextServeAt = null;
  } else {
    state.phase = "point";
    state.nextServeAt = now + PINGPONG.pointPauseMs;
  }
}

/**
 * The receiver hits the ball at `now`: within the window the ball goes back
 * (a perfect hit is a smash, faster; a lob flies slow and high whatever the
 * timing), too early is a point for the sender, too late is ignored (the
 * tick already called the miss).
 */
export function hitPingPong(state: PingPongState, userId: string, now: number, shot: PingPongShot = "normal"): HitOutcome {
  if (state.phase !== "flight" || !state.flight) return { ok: false, reason: "phase" };
  const flight = state.flight;
  if (flight.to !== userId) return { ok: false, reason: "not_receiver" };
  const windows = hitWindows(flight, state.rules);
  const offsetMs = now - flight.arrivesAt;
  if (offsetMs < -windows.good) {
    awardPoint(state, flight.from, "early", now);
    note(state, { kind: "miss", player: userId, reason: "early", at: now });
    return { ok: false, reason: "early" };
  }
  if (offsetMs > windows.good) return { ok: false, reason: "late" };
  const quality: HitQuality = Math.abs(offsetMs) <= windows.perfect ? "perfect" : "good";
  const kind: FlightKind = shot === "lob" ? "lob" : quality === "perfect" ? "smash" : "normal";
  state.hits[userId] = (state.hits[userId] ?? 0) + 1;
  if (quality === "perfect") state.perfects[userId] = (state.perfects[userId] ?? 0) + 1;
  state.currentRally += 1;
  // The ball leaves when it arrived (not when the report came in): a late report never slows the rally.
  launch(state, userId, flight.arrivesAt, flight.pace + (quality === "perfect" ? 2 : 1), quality, kind);
  note(state, { kind: "hit", player: userId, quality, shot: kind, at: now });
  return { ok: true, quality, offsetMs, shot: kind };
}

export type TickOptions = {
  /** Extra time the referee waits for the receiver's report before calling a miss (per receiver). */
  graceFor?: (receiver: string) => number;
};

/** Applies time: serves for a slow server, calls misses, opens the next serve, ends on the clock. */
export function tickPingPong(state: PingPongState, now: number, options: TickOptions = {}): void {
  if (state.phase === "over") return;
  if (now >= state.endsAt) {
    endPingPong(state, now);
    return;
  }
  if (state.phase === "serve" && state.serveDueAt !== null && now >= state.serveDueAt) {
    launch(state, state.server, now, 0, "serve", "normal");
    note(state, { kind: "serve", player: state.server, at: now });
    return;
  }
  if (state.phase === "flight" && state.flight) {
    const grace = options.graceFor?.(state.flight.to) ?? 0;
    if (now > state.flight.arrivesAt + hitWindows(state.flight, state.rules).good + grace) {
      const receiver = state.flight.to;
      awardPoint(state, state.flight.from, "miss", now);
      note(state, { kind: "miss", player: receiver, reason: "miss", at: now });
    }
    return;
  }
  if (state.phase === "point" && state.nextServeAt !== null && now >= state.nextServeAt) {
    state.phase = "serve";
    state.nextServeAt = null;
    state.serveDueAt = now + PINGPONG.serveTimeoutMs;
    state.seq += 1;
  }
}

/** Closes the match on the clock or by hand: the leader wins, a tie stays a tie. */
export function endPingPong(state: PingPongState, now: number): void {
  if (state.phase === "over") return;
  const [a, b] = state.players;
  state.winnerId = state.points[a] > state.points[b] ? a : state.points[b] > state.points[a] ? b : null;
  state.phase = "over";
  state.flight = null;
  state.serveDueAt = null;
  state.nextServeAt = null;
  state.longestRally = Math.max(state.longestRally, state.currentRally);
  state.endsAt = Math.min(state.endsAt, now);
  state.seq += 1;
}

/** A player who left concedes the match. */
export function concedePingPong(state: PingPongState, userId: string, now: number): void {
  if (state.phase === "over") return;
  const winner = other(state, userId);
  state.winnerId = winner;
  state.phase = "over";
  state.flight = null;
  state.serveDueAt = null;
  state.nextServeAt = null;
  state.lastPoint = { to: winner, reason: "left", at: now, rally: state.currentRally };
  state.seq += 1;
}

/** Where the ball is along its flight (0 at the sender, 1 at the receiver) and how high above the line (0–1 arc). */
export function ballProgress(flight: Flight, now: number): { t: number; lift: number } {
  const span = Math.max(1, flight.arrivesAt - flight.launchedAt);
  const t = Math.max(0, Math.min(1, (now - flight.launchedAt) / span));
  return { t, lift: 4 * t * (1 - t) };
}

/** Whether `now` is inside the hit window of the current flight (for the timing ring). */
export function inHitWindow(flight: Flight, now: number, rules: PingPongRules = DEFAULT_RULES.pingpong): boolean {
  return Math.abs(now - flight.arrivesAt) <= hitWindows(flight, rules).good;
}

/**
 * Whether the timing ring helps the receiver right now: not once the rally
 * is long enough (`ringHideAfterHits`), and not on the way down of a lob.
 */
export function timingRingShown(state: PingPongState, now: number): boolean {
  const flight = state.phase === "flight" ? state.flight : null;
  if (!flight) return false;
  if (state.rules.ringHideAfterHits > 0 && state.currentRally >= state.rules.ringHideAfterHits) return false;
  if (flight.kind === "lob") return ballProgress(flight, now).t < 1 - PINGPONG.lobHiddenTail;
  return true;
}

/** Reward 0–100: half for the share of points, half for the win (a quarter on a tie); perfect = a win without conceding a point. */
export function pingpongScore(mine: number, theirs: number, won: boolean | null): { score: number; perfect: boolean } {
  const total = mine + theirs;
  const share = total > 0 ? mine / total : 0.5;
  const score = Math.round(50 * share + (won === true ? 50 : won === null ? 25 : 0));
  return { score: Math.max(0, Math.min(100, score)), perfect: won === true && theirs === 0 };
}

/** The host's published state. */
export type PingPongStateMessage = { hostTime: number; state: PingPongState };

/** A JSON-safe copy of the state without the visual notes. */
export function serializePingPong(state: PingPongState): PingPongState {
  const copy = JSON.parse(JSON.stringify(state)) as PingPongState;
  copy.recent = [];
  return copy;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isCounters = (v: unknown): v is Record<string, number> => !!v && typeof v === "object" && Object.values(v as Record<string, unknown>).every(isNumber);
const RULE_KEYS = Object.keys(DEFAULT_RULES.pingpong) as (keyof PingPongRules)[];

/** The rules carried by a published state; the defaults when absent or malformed (older phones). */
function parseRules(raw: unknown): PingPongRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_RULES.pingpong };
  const r = raw as Record<string, unknown>;
  const rules = { ...DEFAULT_RULES.pingpong };
  for (const key of RULE_KEYS) if (isNumber(r[key])) rules[key] = r[key];
  return rules;
}

/** Reads a published state (from a peer or the server) or returns null when it does not look like one. */
export function parsePingPongState(raw: unknown): PingPongStateMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!isNumber(m.hostTime) || !m.state || typeof m.state !== "object") return null;
  const s = m.state as Record<string, unknown>;
  if (!Array.isArray(s.players) || s.players.length !== 2 || !s.players.every((p) => typeof p === "string" && p.length > 0)) return null;
  if (!isCounters(s.points) || !isCounters(s.hits) || !isCounters(s.perfects) || !isCounters(s.misses)) return null;
  if (typeof s.server !== "string" || !["serve", "flight", "point", "over"].includes(s.phase as string)) return null;
  if (!isNumber(s.seq) || !isNumber(s.nextFlightId) || !isNumber(s.startedAt) || !isNumber(s.endsAt)) return null;
  let flight: Flight | null = null;
  if (s.flight !== null && s.flight !== undefined) {
    const f = s.flight as Record<string, unknown>;
    if (!f || typeof f !== "object" || !isNumber(f.id) || typeof f.from !== "string" || typeof f.to !== "string" || !isNumber(f.launchedAt) || !isNumber(f.arrivesAt) || !isNumber(f.pace)) return null;
    const kind: FlightKind = f.kind === "lob" || f.kind === "smash" ? f.kind : "normal";
    flight = { ...(f as unknown as Flight), kind };
  }
  const state = { ...(s as unknown as PingPongState), rules: parseRules(s.rules), flight, recent: [] };
  return { hostTime: m.hostTime, state };
}
