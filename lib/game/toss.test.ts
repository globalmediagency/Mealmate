import { describe, expect, it } from "vitest";
import { TOSS } from "./config";
import { createToss, dressToss, grabToss, isTossActive, moveToss, releaseToss, resizeToss, stepToss, type AnchorOf, type TossEvent, type TossState } from "./toss";

const BOUNDS = { width: 360, height: 320 };
const SIZE = 220;
const OUTFIT = [
  { slot: "neck" as const, id: "bow_tie" },
  { slot: "head" as const, id: "beret" },
  { slot: "eyes" as const, id: "round_glasses" },
];
const anchorOf: AnchorOf = (slot) => ({ head: { dx: 0, dy: -70 }, eyes: { dx: 0, dy: -20 }, neck: { dx: 0, dy: 20 }, body: { dx: 0, dy: 50 } })[slot];

function lcg(seed = 3): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Runs the simulation in 10 ms steps for `seconds`, collecting the events. */
function run(state: TossState, seconds: number, random = lcg()): TossEvent[] {
  const events: TossEvent[] = [];
  for (let t = 0; t < seconds; t += 0.01) events.push(...stepToss(state, 0.01, random, anchorOf));
  return events;
}

describe("createToss / grab / move", () => {
  it("stands the creature at the bottom centre, sorted outfit on, and follows the finger inside the scene", () => {
    const state = createToss(BOUNDS, SIZE, OUTFIT);
    expect(state.phase).toBe("idle");
    expect(state.x).toBe(180);
    expect(state.y).toBe(320 - TOSS.restBottom - SIZE / 2);
    expect(state.worn.map((a) => a.slot)).toEqual(["head", "eyes", "neck"]);
    expect(isTossActive(state)).toBe(false);
    grabToss(state, 190, state.y + 30);
    expect(state.phase).toBe("held");
    moveToss(state, 250, 100);
    expect(state.x).toBe(240);
    expect(state.y).toBe(70);
    // Never beyond the walls, never below its feet.
    moveToss(state, -500, 900);
    expect(state.x).toBe(SIZE * TOSS.halfWidth);
    expect(state.y).toBe(state.rest.y);
    expect(stepToss(state, 0.05, lcg(), anchorOf)).toEqual([]);
  });

  it("treats a slow release as a drop: it falls, lands, walks home and keeps everything on", () => {
    const state = createToss(BOUNDS, SIZE, OUTFIT);
    grabToss(state, state.x, state.y);
    moveToss(state, 220, state.rest.y - 40);
    expect(releaseToss(state, 20, 0)).toEqual([]);
    expect(state.thrown).toBe(false);
    const events = run(state, 3);
    expect(events.some((e) => e.kind === "throw")).toBe(false);
    expect(events.some((e) => e.kind === "drop")).toBe(false);
    expect(events.filter((e) => e.kind === "land")).toHaveLength(1);
    expect(events.at(-1)).toEqual({ kind: "home", collected: 0 });
    expect(state.phase).toBe("idle");
    expect(state.x).toBe(state.rest.x);
    expect(state.angle).toBe(0);
    expect(state.worn).toHaveLength(3);
  });
});

describe("a throw", () => {
  it("bounces off the walls, sheds one accessory per hard impact (head first) and reports it", () => {
    const state = createToss(BOUNDS, SIZE, OUTFIT);
    grabToss(state, state.x, state.y);
    moveToss(state, 180, 120);
    const thrown = releaseToss(state, 2200, -900);
    expect(thrown).toEqual([{ kind: "throw", speed: expect.any(Number) }]);
    expect(state.spin).toBeGreaterThan(0);
    const events = run(state, 1);
    const bounces = events.filter((e) => e.kind === "bounce");
    expect(bounces.length).toBeGreaterThanOrEqual(2);
    const drops = events.filter((e): e is Extract<TossEvent, { kind: "drop" }> => e.kind === "drop");
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops[0].accessory.slot).toBe("head");
    // At most one accessory per bounce, none invented.
    expect(drops.length).toBeLessThanOrEqual(bounces.length);
    expect(drops.length + state.worn.length).toBe(3);
    expect(state.loose.length).toBe(drops.length);
    for (const item of state.loose) {
      expect(item.x).toBeGreaterThanOrEqual(SIZE * TOSS.item.half);
      expect(item.x).toBeLessThanOrEqual(BOUNDS.width - SIZE * TOSS.item.half);
      expect(item.y).toBeLessThanOrEqual(state.rest.y + SIZE * TOSS.item.floor);
    }
    // The creature itself never leaves the scene.
    expect(state.x).toBeGreaterThanOrEqual(SIZE * TOSS.halfWidth);
    expect(state.x).toBeLessThanOrEqual(BOUNDS.width - SIZE * TOSS.halfWidth);
    expect(state.y).toBeLessThanOrEqual(state.rest.y);
  });

  it("lands, gets back on its feet, runs to every accessory nearest first, puts them back on and walks home", () => {
    const state = createToss(BOUNDS, SIZE, OUTFIT);
    grabToss(state, state.x, state.y);
    moveToss(state, 100, 80);
    releaseToss(state, 2600, -1200);
    const events = run(state, 12);
    const land = events.find((e) => e.kind === "land");
    expect(land).toBeDefined();
    const drops = events.filter((e) => e.kind === "drop");
    const pickups = events.filter((e): e is Extract<TossEvent, { kind: "pickup" }> => e.kind === "pickup");
    expect(drops.length).toBeGreaterThanOrEqual(2);
    expect(pickups).toHaveLength(drops.length);
    expect(pickups.at(-1)?.left).toBe(0);
    expect(events.at(-1)).toEqual({ kind: "home", collected: drops.length });
    expect(state.phase).toBe("idle");
    expect(state.loose).toEqual([]);
    expect(state.worn).toEqual(state.outfit);
    expect(state.x).toBe(state.rest.x);
    expect(state.angle).toBe(0);
    expect(isTossActive(state)).toBe(false);
  });

  it("runs toward the nearest fallen accessory and faces where it runs", () => {
    const state = createToss(BOUNDS, SIZE, OUTFIT);
    state.phase = "fetching";
    state.worn = [];
    state.loose = [
      { slot: "head", id: "beret", key: "a", x: 320, y: state.rest.y + 60, vx: 0, vy: 0, angle: 0, spin: 0, settled: true, age: 1 },
      { slot: "neck", id: "bow_tie", key: "b", x: 90, y: state.rest.y + 60, vx: 0, vy: 0, angle: 0, spin: 0, settled: true, age: 1 },
      { slot: "eyes", id: "round_glasses", key: "c", x: 200, y: 10, vx: 0, vy: -300, angle: 0, spin: 0, settled: false, age: 0 },
    ];
    stepToss(state, 0.01, lcg(), anchorOf);
    expect(state.facing).toBe(-1); // the bow tie at 90 is nearer than the beret at 320
    const events = run(state, 8);
    const order = events.filter((e): e is Extract<TossEvent, { kind: "pickup" }> => e.kind === "pickup").map((e) => e.accessory.id);
    expect(order).toEqual(["bow_tie", "round_glasses", "beret"]);
    expect(state.worn.map((a) => a.slot)).toEqual(["head", "eyes", "neck"]);
    expect(state.phase).toBe("idle");
  });

  it("without any accessory only bounces, and a resize keeps everything inside the new scene", () => {
    const state = createToss(BOUNDS, SIZE, []);
    grabToss(state, state.x, state.y);
    releaseToss(state, -2000, -1500);
    const events = run(state, 2);
    expect(events.some((e) => e.kind === "drop")).toBe(false);
    expect(events.filter((e) => e.kind === "bounce").length).toBeGreaterThan(0);
    resizeToss(state, { width: 200, height: 260 });
    expect(state.x).toBeLessThanOrEqual(200 - SIZE * TOSS.halfWidth);
    expect(state.rest.y).toBe(260 - TOSS.restBottom - SIZE / 2);
    dressToss(state, OUTFIT);
    expect(state.worn).toHaveLength(3);
    expect(state.loose).toEqual([]);
  });

  it("can be caught again mid-air: the accessories already on the floor are still fetched later", () => {
    const state = createToss(BOUNDS, SIZE, OUTFIT);
    grabToss(state, state.x, state.y);
    moveToss(state, 180, 100);
    releaseToss(state, 2400, -800);
    const events = run(state, 0.5);
    expect(events.some((e) => e.kind === "drop")).toBe(true);
    grabToss(state, state.x, state.y);
    expect(state.phase).toBe("held");
    expect(state.angle).toBe(0);
    releaseToss(state, 0, 0);
    const later = run(state, 12);
    expect(later.at(-1)?.kind).toBe("home");
    expect(state.worn).toEqual(state.outfit);
  });
});
