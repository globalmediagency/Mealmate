import { describe, expect, it } from "vitest";
import { TOSS } from "./config";
import { createToss, dressToss, grabToss, isTossActive, moveToss, pinPoint, releaseToss, resizeToss, stepToss, tossShadow, type AnchorOf, type TossEvent, type TossState } from "./toss";

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
  it("stands the creature at the bottom centre, sorted outfit on, and hangs it from the point the finger holds", () => {
    const state = createToss(BOUNDS, SIZE, OUTFIT);
    expect(state.phase).toBe("idle");
    expect(state.x).toBe(180);
    expect(state.y).toBe(320 - TOSS.restBottom - SIZE / 2);
    expect(state.worn.map((a) => a.slot)).toEqual(["head", "eyes", "neck"]);
    expect(isTossActive(state)).toBe(false);
    // Grabbed by the top of the head (above its centre): it hangs head up under the finger.
    grabToss(state, 180, state.y - 80);
    expect(state.phase).toBe("held");
    expect(state.pin).toEqual({ dx: 0, dy: -80 });
    moveToss(state, 250, 100);
    run(state, 4);
    const held = pinPoint(state);
    expect(held.x).toBeCloseTo(250, 0);
    expect(held.y).toBeCloseTo(100, 0);
    // Hanging under the finger (a last, faint swing may remain).
    expect(Math.abs(state.x - 250)).toBeLessThan(8);
    expect(Math.abs(state.y - 180)).toBeLessThan(3);
    expect(Math.abs(state.angle)).toBeLessThan(6);
    // The finger never leaves the scene: the pin is kept inside, the creature with it.
    moveToss(state, -500, 900);
    run(state, 1);
    expect(state.pivotTarget.x).toBe(SIZE * TOSS.halfWidth);
    expect(state.pivotTarget.y).toBe(state.rest.y);
    expect(state.x).toBeGreaterThanOrEqual(SIZE * TOSS.halfWidth);
    expect(state.y).toBeLessThanOrEqual(state.rest.y);
  });

  it("swings around the finger: held by the side it ends up sideways, held by the feet upside down", () => {
    const side = createToss(BOUNDS, SIZE, []);
    grabToss(side, side.x - 50, side.y);
    moveToss(side, 180, 60);
    run(side, 6);
    // Centre to the right of the pin at the start: it swings down clockwise and hangs there.
    expect(((side.angle % 360) + 360) % 360).toBeGreaterThan(80);
    expect(((side.angle % 360) + 360) % 360).toBeLessThan(100);
    expect(side.y).toBeGreaterThan(side.pivot.y + 40);
    const feet = createToss(BOUNDS, SIZE, []);
    grabToss(feet, feet.x + 6, feet.y + 70);
    moveToss(feet, 180, 40);
    run(feet, 7);
    expect(Math.abs(((feet.angle % 360) + 360) % 360 - 180)).toBeLessThan(15);
    expect(feet.y).toBeGreaterThan(feet.pivot.y + 40);
  });

  it("is spun up by a circular finger motion and flung when let go", () => {
    const state = createToss(BOUNDS, SIZE, []);
    grabToss(state, state.x, state.y - 60);
    // Two fast turns of the finger around the middle of the scene.
    const cx = 180;
    const cy = 150;
    let t = 0;
    const finger = (at: number) => ({ x: cx + 70 * Math.cos(at * 2 * Math.PI * 1.5), y: cy + 70 * Math.sin(at * 2 * Math.PI * 1.5) });
    for (let step = 0; step < 240; step += 1) {
      t += 1 / 120;
      const p = finger(t);
      moveToss(state, p.x, p.y);
      stepToss(state, 1 / 120, lcg(), anchorOf);
    }
    expect(Math.abs(state.spin)).toBeGreaterThan(120);
    // Let go while the finger still moves: the finger's speed plus the swing's.
    const last = finger(t);
    const before = finger(t - 1 / 120);
    const events = releaseToss(state, (last.x - before.x) * 120, (last.y - before.y) * 120);
    expect(events).toEqual([{ kind: "throw", speed: expect.any(Number) }]);
    expect(Math.hypot(state.vx, state.vy)).toBeGreaterThan(TOSS.throwMinSpeed);
    expect(Math.abs(state.spin)).toBeGreaterThan(100);
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
    run(state, 0.3);
    releaseToss(state, 0, 0);
    const later = run(state, 12);
    expect(later.at(-1)?.kind).toBe("home");
    expect(state.worn).toEqual(state.outfit);
  });
});

describe("tossShadow / physics", () => {
  it("keeps the shadow on the ground line under the creature, smaller and fainter the higher it is", () => {
    const state = createToss(BOUNDS, SIZE, []);
    const rest = tossShadow(state);
    expect(rest).toEqual({ x: state.rest.x, y: state.rest.y + SIZE * TOSS.shadowLine, scale: 1, opacity: TOSS.shadowOpacity });
    state.x = 100;
    state.y = state.rest.y - SIZE;
    state.angle = 137;
    const high = tossShadow(state);
    expect(high.x).toBe(100);
    expect(high.y).toBe(rest.y);
    expect(high.scale).toBeCloseTo(0.5, 6);
    expect(high.opacity).toBeCloseTo(TOSS.shadowOpacity * 0.5, 6);
    state.y = -SIZE * 5;
    expect(tossShadow(state).scale).toBe(TOSS.shadowMinScale);
  });

  it("bounces as much as the admin rules say", () => {
    const lively = createToss(BOUNDS, SIZE, [], { restitution: 0.95, floorRestitution: 0.9 });
    const dull = createToss(BOUNDS, SIZE, [], { restitution: 0.1, floorRestitution: 0.1 });
    expect(createToss(BOUNDS, SIZE, [], { restitution: 3, floorRestitution: -1 }).physics).toEqual({ restitution: 0.98, floorRestitution: 0 });
    expect(createToss(BOUNDS, SIZE, []).physics).toEqual({ restitution: TOSS.restitution, floorRestitution: TOSS.floorRestitution });
    for (const state of [lively, dull]) {
      grabToss(state, state.x, state.y);
      releaseToss(state, 1800, -900);
    }
    const livelyBounces = run(lively, 6).filter((e) => e.kind === "bounce").length;
    const dullBounces = run(dull, 6).filter((e) => e.kind === "bounce").length;
    expect(livelyBounces).toBeGreaterThan(dullBounces + 2);
    expect(lively.phase).toBe("idle");
    expect(dull.phase).toBe("idle");
  });
});
