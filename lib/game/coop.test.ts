import { describe, expect, it } from "vitest";
import { advanceDefense, coopOver, coopRandom, coopScore, parseCoopState, serializeDefense } from "./coop";
import { applyCatch, createDefense, fireDefense, smashDefense, startDefense, stepDefense, tongueDefense, type DefenseState } from "./defense";
import { DEFAULT_RULES } from "./rules";

/** Runs the simulation for `seconds` in 60 Hz steps (no catch-up cap, unlike `advanceDefense`). */
function simulate(state: DefenseState, random: () => number, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) stepDefense(state, 1 / 60, random);
}

function playedGame(seed: number, seconds: number): DefenseState {
  const state = createDefense({ ...DEFAULT_RULES.defense, hp: 1000 });
  const random = coopRandom(seed, 0);
  startDefense(state);
  simulate(state, random.next, seconds);
  return state;
}

describe("Défendre à deux", () => {
  it("replays the same waves from the same seed, and different ones for another creature", () => {
    const a = playedGame(7, 12);
    const b = playedGame(7, 12);
    expect(b.enemies.map((e) => [e.id, e.kind, e.x.toFixed(4), e.y.toFixed(4)])).toEqual(a.enemies.map((e) => [e.id, e.kind, e.x.toFixed(4), e.y.toFixed(4)]));
    const other = createDefense({ ...DEFAULT_RULES.defense, hp: 1000 });
    startDefense(other);
    simulate(other, coopRandom(7, 1).next, 12);
    expect(other.enemies.map((e) => e.angle)).not.toEqual(a.enemies.map((e) => e.angle));
  });

  it("serialises a state and resumes it with the generator's state", () => {
    const state = createDefense({ ...DEFAULT_RULES.defense, hp: 1000 });
    const random = coopRandom(3, 0);
    startDefense(state);
    simulate(state, random.next, 8);
    const message = { hostTime: 1000, states: { me: { state: serializeDefense(state), rng: random.state() } } };
    const parsed = parseCoopState(JSON.parse(JSON.stringify(message)));
    expect(parsed).not.toBeNull();
    const resumed = parsed!.states.me.state;
    const resumedRandom = coopRandom(0, 0);
    resumedRandom.restore(parsed!.states.me.rng);
    simulate(state, random.next, 5);
    simulate(resumed, resumedRandom.next, 5);
    expect(resumed.enemies.map((e) => [e.id, e.x.toFixed(4)])).toEqual(state.enemies.map((e) => [e.id, e.x.toFixed(4)]));
    expect(resumed.summary).toEqual(state.summary);
    expect(parseCoopState({ hostTime: 1 })).toBeNull();
    expect(parseCoopState({ hostTime: 1, states: { x: { state: { hp: 1 }, rng: 2 } } })).toBeNull();
  });

  it("applies a partner's landing and catch without drawing on the reload, and a cosmetic egg smashes nothing", () => {
    const state = createDefense({ ...DEFAULT_RULES.defense, hp: 1000 });
    startDefense(state);
    const random = coopRandom(11, 0);
    simulate(state, random.next, 10);
    const target = state.enemies.find((e) => e.phase === "moving")!;
    expect(target).toBeDefined();
    const before = state.summary.destroyed;
    // A cosmetic egg from the partner: drawn, bypasses the reload, changes no counter.
    expect(fireDefense(state, { x: 1, y: 0 })).toBe(true);
    expect(fireDefense(state, { x: 1, y: 0 })).toBe(false);
    expect(fireDefense(state, { x: target.x, y: target.y }, { cosmetic: true, from: { x: 2, y: 2, z: 1 } })).toBe(true);
    const cosmetic = state.eggs.at(-1)!;
    expect(cosmetic.cosmetic).toBe(true);
    expect(cosmetic.from).toEqual({ x: 2, y: 2, z: 1 });
    stepDefense(state, cosmetic.duration + 0.01, () => 0.5);
    expect(state.enemies.some((e) => e.id === target.id) || state.summary.reached > 0).toBe(true);
    // The partner reports what its egg hit: the food takes the hit here too.
    smashDefense(state, { hits: [target.id], x: target.x, y: target.y });
    expect(state.enemies.some((e) => e.id === target.id)).toBe(false);
    expect(state.summary.destroyed).toBe(before + 1);
    // Unknown ids are ignored, and a catch of a good food heals only when it is still there.
    smashDefense(state, { hits: [99999], x: 0, y: 0 });
    state.hp = 500;
    state.bonuses.push({ id: 4242, kind: "apple", x: 1, y: 1, age: 0, heal: 10 });
    applyCatch(state, { bonusIds: [4242], junkIds: [] });
    expect(state.hp).toBe(510);
    applyCatch(state, { bonusIds: [4242], junkIds: [] });
    expect(state.hp).toBe(510);
    expect(tongueDefense(state, { x: 1, y: 0 }, { cosmetic: true })).toBe(true);
    expect(state.tongue?.cosmetic).toBe(true);
  });

  it("records the own landings and catches for the partner report", () => {
    const state = createDefense({ ...DEFAULT_RULES.defense, hp: 1000 });
    startDefense(state);
    simulate(state, coopRandom(5, 0).next, 10);
    const target = state.enemies.find((e) => e.phase === "moving")!;
    fireDefense(state, { x: target.x, y: target.y });
    const egg = state.eggs[0];
    stepDefense(state, egg.duration + 0.01, () => 0.5);
    expect(state.recentSmashes).toHaveLength(1);
    expect(state.recentSmashes[0].hits).toContain(target.id);
    state.recentSmashes.length = 0;
    expect(state.recentSmashes).toEqual([]);
  });

  it("catches up a published state in small steps, no further than the cap", () => {
    const state = createDefense({ ...DEFAULT_RULES.defense, hp: 1000 });
    startDefense(state);
    advanceDefense(state, coopRandom(1, 0).next, 10);
    expect(state.time).toBeCloseTo(2, 5);
    advanceDefense(state, coopRandom(1, 0).next, 0.5);
    expect(state.time).toBeCloseTo(2.5, 5);
  });

  it("scores the team as the mean of the creatures and ends when every creature fell", () => {
    const rules = DEFAULT_RULES.defense;
    const full = { spawned: 10, destroyed: 10, reached: 0, wavesCleared: 3, shots: 10, bosses: 0, goodEaten: 0, healed: 0, junkEaten: 0, goodWasted: 0 };
    const weak = { ...full, destroyed: 5, reached: 5 };
    expect(coopScore([full, full], rules)).toEqual({ score: 100, perfect: true });
    expect(coopScore([full, weak], rules).perfect).toBe(false);
    expect(coopScore([full, weak], rules).score).toBe(75);
    expect(coopScore([], rules)).toEqual({ score: 0, perfect: false });
    const a = createDefense();
    const b = createDefense();
    expect(coopOver([a, b])).toBe(false);
    a.status = "over";
    expect(coopOver([a, b])).toBe(false);
    b.status = "over";
    expect(coopOver([a, b])).toBe(true);
    expect(coopOver([])).toBe(false);
  });
});
