/**
 * "Défendre à deux" (spec § 3.23): the junk attacks every creature of the
 * match, each one on its own paper, and the players shoot at any of them.
 * Every phone runs the same seeded simulation per creature; the host's copy
 * is the truth and the others resync to it. Pure helpers here.
 */
import { COOP } from "./config";
import { computeDefenseScore, stepDefense, type DefenseState, type DefenseSummary } from "./defense";
import { createSeededRandom, type SeededRandom } from "./random";
import type { DefenseRules } from "./rules";

/** The creatures' simulations as the host publishes them: one per player, with the generator's state. */
export type CoopStateMessage = {
  /** The host's clock when it was taken (ms, `Date.now()` of the host's phone). */
  hostTime: number;
  states: Record<string, { state: DefenseState; rng: number }>;
};

/** Reads a published state (from a peer or the server) or returns null when it does not look like one. */
export function parseCoopState(raw: unknown): CoopStateMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.hostTime !== "number" || !Number.isFinite(m.hostTime)) return null;
  if (!m.states || typeof m.states !== "object") return null;
  const states: CoopStateMessage["states"] = {};
  for (const [userId, entry] of Object.entries(m.states as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    const state = e.state as Record<string, unknown> | undefined;
    if (!state || typeof state !== "object" || typeof e.rng !== "number") return null;
    if (!Array.isArray(state.enemies) || !Array.isArray(state.eggs) || !Array.isArray(state.bonuses) || typeof state.hp !== "number" || typeof state.status !== "string") return null;
    states[userId] = { state: state as unknown as DefenseState, rng: e.rng };
  }
  return { hostTime: m.hostTime, states };
}

/** The generator of one creature's waves: the match seed and the creature's rank in the match. */
export function coopRandom(seed: number, index: number): SeededRandom {
  return createSeededRandom(seed * 7919 + index * 104_729 + 1);
}

/** Steps a simulation forward by `seconds` in small increments (a guest catching up on the host's state). */
export function advanceDefense(state: DefenseState, random: () => number, seconds: number, step = COOP.catchUpStepSeconds) {
  let left = Math.max(0, Math.min(COOP.maxCatchUpSeconds, seconds));
  while (left > 0) {
    const dt = Math.min(step, left);
    stepDefense(state, dt, random);
    left -= dt;
  }
}

/** Whether every creature has fallen (the battle is over). */
export function coopOver(states: Iterable<DefenseState>): boolean {
  let any = false;
  for (const state of states) {
    any = true;
    if (state.status !== "over") return false;
  }
  return any;
}

export type CoopResult = { score: number; perfect: boolean };

/** The team's reward: the mean of each creature's defense score, perfect when every creature's game was. */
export function coopScore(summaries: DefenseSummary[], rules: DefenseRules): CoopResult {
  if (summaries.length === 0) return { score: 0, perfect: false };
  const parts = summaries.map((s) => computeDefenseScore(s, rules));
  const score = Math.round(parts.reduce((sum, p) => sum + p.score, 0) / parts.length);
  return { score, perfect: parts.every((p) => p.perfect) };
}

/** A JSON-safe copy of a simulation (the state is plain data; `-Infinity` timers become large negatives). */
export function serializeDefense(state: DefenseState): DefenseState {
  const copy = JSON.parse(JSON.stringify(state, (_key, value) => (value === -Infinity ? -1e9 : value))) as DefenseState;
  copy.recentSmashes = [];
  copy.recentCatches = [];
  return copy;
}
