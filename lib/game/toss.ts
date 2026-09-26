import { SLOTS, type Slot } from "@/lib/accessories/catalog";
import { TOSS } from "./config";

/**
 * Tossing the creature on its home screen (spec § 3.5), pure and in scene
 * pixels: the finger holds it, a release throws it, it bounces off the four
 * walls of its scene losing one accessory per hard impact, lands, gets back
 * on its feet, then runs to each fallen accessory (nearest first) and puts it
 * back on before walking home. Nothing here touches the DOM or the server:
 * the outfit is never changed, only what is drawn on the creature meanwhile.
 */
export type TossPhase = "idle" | "held" | "flying" | "landing" | "fetching" | "returning";

export type TossAccessory = { slot: Slot; id: string };

export type LooseAccessory = TossAccessory & {
  key: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  settled: boolean;
  /** Seconds since it fell (a stuck one is settled after `TOSS.item.maxSeconds`). */
  age: number;
};

export type TossBounds = { width: number; height: number };

/** How much of its speed the creature keeps on a wall / ceiling bounce and on a floor bounce (`rules.home`, defaults `TOSS`). */
export type TossPhysics = { restitution: number; floorRestitution: number };
export const DEFAULT_TOSS_PHYSICS: TossPhysics = { restitution: TOSS.restitution, floorRestitution: TOSS.floorRestitution };

export type TossState = {
  width: number;
  height: number;
  /** Side of the creature drawing (px). */
  size: number;
  physics: TossPhysics;
  /** Where the creature stands when nothing happens (its centre). */
  rest: { x: number; y: number };
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Degrees, clockwise. */
  angle: number;
  spin: number;
  phase: TossPhase;
  /** Seconds elapsed in the current phase. */
  phaseAt: number;
  /** Angle at the start of the landing, eased back to 0. */
  landFrom: number;
  /** Pause before the next move (after a pick-up). */
  wait: number;
  /** The whole outfit, in wearing order; `worn` = what is still on. */
  outfit: TossAccessory[];
  worn: TossAccessory[];
  loose: LooseAccessory[];
  /** Where the creature runs: −1 left, 1 right, 0 still. */
  facing: -1 | 0 | 1;
  /** While held: the grabbed point on the drawing (offset from its centre, unrotated) and the finger it hangs from (`pivot` follows `pivotTarget`). */
  pin: { dx: number; dy: number };
  pivot: { x: number; y: number };
  pivotTarget: { x: number; y: number };
  /** Bounces since the release; `thrown` when the release was fast enough to count as a throw; `picked` = accessories put back since. */
  bounces: number;
  thrown: boolean;
  picked: number;
  nextKey: number;
};

export type TossEvent =
  | { kind: "throw"; speed: number }
  | { kind: "bounce"; speed: number }
  | { kind: "drop"; accessory: TossAccessory }
  | { kind: "land"; loose: number; thrown: boolean }
  | { kind: "pickup"; accessory: TossAccessory; left: number }
  | { kind: "home"; collected: number };

/** Offset (px) of an accessory anchor from the creature's centre, before rotation. */
export type AnchorOf = (slot: Slot) => { dx: number; dy: number };

const SLOT_ORDER = new Map(SLOTS.map((slot, i) => [slot, i]));
const sortOutfit = (list: TossAccessory[]) => [...list].sort((a, b) => (SLOT_ORDER.get(a.slot) ?? 0) - (SLOT_ORDER.get(b.slot) ?? 0));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hypot = (x: number, y: number) => Math.sqrt(x * x + y * y);

function restOf(bounds: TossBounds, size: number): { x: number; y: number } {
  return { x: bounds.width / 2, y: bounds.height - TOSS.restBottom - size / 2 };
}

export function createToss(bounds: TossBounds, size: number, outfit: readonly TossAccessory[], physics: TossPhysics = DEFAULT_TOSS_PHYSICS): TossState {
  const rest = restOf(bounds, size);
  const worn = sortOutfit([...outfit]);
  return {
    width: bounds.width,
    height: bounds.height,
    size,
    physics: { restitution: clamp(physics.restitution, 0, 0.98), floorRestitution: clamp(physics.floorRestitution, 0, 0.98) },
    rest,
    x: rest.x,
    y: rest.y,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    phase: "idle",
    phaseAt: 0,
    landFrom: 0,
    wait: 0,
    outfit: worn,
    worn: [...worn],
    loose: [],
    facing: 0,
    pin: { dx: 0, dy: 0 },
    pivot: { x: rest.x, y: rest.y },
    pivotTarget: { x: rest.x, y: rest.y },
    bounces: 0,
    thrown: false,
    picked: 0,
    nextKey: 1,
  };
}

/** The scene changed size: the rest spot moves with it, an idle creature follows at once. */
export function resizeToss(state: TossState, bounds: TossBounds): void {
  state.width = bounds.width;
  state.height = bounds.height;
  state.rest = restOf(bounds, state.size);
  if (state.phase === "idle") {
    state.x = state.rest.x;
    state.y = state.rest.y;
  } else {
    state.x = clamp(state.x, halfWidth(state), state.width - halfWidth(state));
    state.y = clamp(state.y, halfHeight(state), state.rest.y);
  }
  for (const item of state.loose) {
    item.x = clamp(item.x, itemHalf(state), state.width - itemHalf(state));
    item.y = Math.min(item.y, itemFloor(state));
  }
}

/** A new outfit from the server (wardrobe): worn again in full, nothing on the floor. */
export function dressToss(state: TossState, outfit: readonly TossAccessory[]): void {
  state.outfit = sortOutfit([...outfit]);
  state.worn = [...state.outfit];
  state.loose = [];
}

const halfWidth = (s: TossState) => s.size * TOSS.halfWidth;
const halfHeight = (s: TossState) => s.size * TOSS.halfHeight;
const itemHalf = (s: TossState) => s.size * TOSS.item.half;
const itemFloor = (s: TossState) => s.rest.y + s.size * TOSS.item.floor;

/** True while something moves or the creature is away from its spot: the screen keeps stepping. */
export function isTossActive(state: TossState): boolean {
  return state.phase !== "idle" || state.loose.some((item) => !item.settled);
}

/** The point of the drawing the finger holds, in the scene (the pin rotated with the creature, from its centre). */
export type TossShadow = { x: number; y: number; scale: number; opacity: number };

/**
 * The creature's shadow stays on the floor whatever it does: under its centre,
 * on the ground line of the drawing (where the SVG paints it at rest),
 * smaller and fainter the higher it flies or hangs.
 */
export function tossShadow(state: TossState): TossShadow {
  const height = Math.max(0, state.rest.y - state.y);
  const scale = clamp(1 - height / (state.size * 2), TOSS.shadowMinScale, 1);
  return { x: state.x, y: state.rest.y + state.size * TOSS.shadowLine, scale, opacity: TOSS.shadowOpacity * scale };
}

export function pinPoint(state: TossState): { x: number; y: number } {
  const rad = (state.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: state.x + state.pin.dx * cos - state.pin.dy * sin, y: state.y + state.pin.dx * sin + state.pin.dy * cos };
}

/**
 * The finger takes the creature (from rest, mid-air or while it runs) by the
 * very point it touched: from then on the creature hangs from that point and
 * swings around it (a pin joint, see `stepHeld`), keeping the orientation and
 * the motion it had.
 */
export function grabToss(state: TossState, px: number, py: number): void {
  const rad = (state.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = px - state.x;
  const ry = py - state.y;
  state.phase = "held";
  state.phaseAt = 0;
  // Local offset of the touched point: the scene offset rotated back by the creature's angle.
  state.pin = { dx: rx * cos + ry * sin, dy: -rx * sin + ry * cos };
  state.pivot = { x: px, y: py };
  state.pivotTarget = { x: px, y: py };
  state.facing = 0;
  state.wait = 0;
}

/** The finger moves: the pin follows it (kept inside the scene), the creature swings after it. */
export function moveToss(state: TossState, px: number, py: number): void {
  if (state.phase !== "held") return;
  state.pivotTarget = { x: clamp(px, halfWidth(state), state.width - halfWidth(state)), y: clamp(py, halfHeight(state), state.rest.y) };
}

/**
 * The finger lets go, moving at this speed (px/s): the creature leaves with
 * the finger's speed plus the speed of its swing around it (a circular
 * motion flings it), and keeps turning. A slow release is a drop, not a throw.
 */
export function releaseToss(state: TossState, vx: number, vy: number): TossEvent[] {
  if (state.phase !== "held") return [];
  // Speed of the centre = speed of the pin (the finger) + the swing's tangential speed around it.
  const omega = (state.spin * Math.PI) / 180;
  const pin = pinPoint(state);
  const rx = state.x - pin.x;
  const ry = state.y - pin.y;
  const bodyVx = vx - omega * ry;
  const bodyVy = vy + omega * rx;
  const speed = hypot(bodyVx, bodyVy);
  const scale = speed > TOSS.maxSpeed ? TOSS.maxSpeed / speed : 1;
  state.vx = bodyVx * scale;
  state.vy = bodyVy * scale;
  state.thrown = speed >= TOSS.throwMinSpeed;
  state.spin = clamp(state.spin + (state.thrown ? state.vx * TOSS.spinPerSpeed * 0.5 : 0), -TOSS.maxSpin, TOSS.maxSpin);
  if (!state.thrown && Math.abs(state.spin) < 30) state.spin = 0;
  state.bounces = 0;
  state.picked = 0;
  state.phase = "flying";
  state.phaseAt = 0;
  return state.thrown ? [{ kind: "throw", speed: Math.min(speed, TOSS.maxSpeed) }] : [];
}

/** Rotates an anchor offset by the creature's angle: where the accessory is right now, in the scene. */
function anchorPoint(state: TossState, slot: Slot, anchorOf: AnchorOf): { x: number; y: number } {
  const { dx, dy } = anchorOf(slot);
  const rad = (state.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: state.x + dx * cos - dy * sin, y: state.y + dx * sin + dy * cos };
}

/** One accessory comes off (the first still worn: head, eyes, neck, then body) and flies away from the impact. */
function shed(state: TossState, impact: number, random: () => number, anchorOf: AnchorOf): TossEvent | null {
  const accessory = state.worn[0];
  if (!accessory) return null;
  state.worn = state.worn.slice(1);
  const at = anchorPoint(state, accessory.slot, anchorOf);
  const item: LooseAccessory = {
    ...accessory,
    key: `${accessory.slot}-${state.nextKey++}`,
    x: clamp(at.x, itemHalf(state), state.width - itemHalf(state)),
    y: Math.min(at.y, itemFloor(state)),
    vx: state.vx * 0.5 + (random() - 0.5) * 400,
    vy: -Math.abs(impact) * 0.45 - 150 - random() * 250,
    angle: state.angle,
    spin: (random() - 0.5) * 1080,
    settled: false,
    age: 0,
  };
  state.loose = [...state.loose, item];
  return { kind: "drop", accessory };
}

/** A wall, ceiling or floor hit: counted, and one accessory lost when it was hard. */
function bounce(state: TossState, impact: number, random: () => number, anchorOf: AnchorOf, events: TossEvent[]): void {
  state.bounces += 1;
  events.push({ kind: "bounce", speed: Math.abs(impact) });
  if (Math.abs(impact) >= TOSS.dropImpactSpeed) {
    const dropped = shed(state, impact, random, anchorOf);
    if (dropped) events.push(dropped);
  }
}

/**
 * Held: a rigid body hanging from the pin, solved position-based. Gravity
 * and the velocities move the centre and the angle, then a few passes pull
 * the grabbed point back onto the finger, sharing the correction between a
 * shift and a turn (the further from the centre the finger holds, the more
 * it turns), and keep the centre inside the scene. The velocities are read
 * back from the move, so a circular finger motion spins the creature up and
 * a release keeps that swing. Damping settles it hanging below the finger,
 * head up, head down or sideways depending on where it is held.
 */
function stepHeld(state: TossState, dt: number): void {
  // Velocities are read back from the move: a step too short would turn a residual correction into a huge speed.
  if (dt < 1e-4) return;
  const follow = Math.min(1, TOSS.pivotFollow * dt);
  state.pivot.x += (state.pivotTarget.x - state.pivot.x) * follow;
  state.pivot.y += (state.pivotTarget.y - state.pivot.y) * follow;
  const x0 = state.x;
  const y0 = state.y;
  const rad0 = (state.angle * Math.PI) / 180;
  // The swing lives in both the turn and the centre's motion (the pin converts one into the other): damp both.
  const keep = Math.max(0, 1 - TOSS.swingDamping * dt);
  const omega = ((state.spin * Math.PI) / 180) * keep;
  state.vx *= keep;
  state.vy = state.vy * keep + TOSS.gravity * dt;
  let x = x0 + state.vx * dt;
  let y = y0 + state.vy * dt;
  let rad = rad0 + omega * dt;
  const inertia = (state.size * TOSS.gyration) ** 2;
  const hw = halfWidth(state);
  const hh = halfHeight(state);
  for (let i = 0; i < TOSS.pinIterations; i += 1) {
    // The grabbed point, where it is now, and how far it sits from the finger.
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = state.pin.dx * cos - state.pin.dy * sin;
    const ry = state.pin.dx * sin + state.pin.dy * cos;
    const ex = state.pivot.x - (x + rx);
    const ey = state.pivot.y - (y + ry);
    const dist = hypot(ex, ey);
    if (dist > 1e-6) {
      const nx = ex / dist;
      const ny = ey / dist;
      const cross = rx * ny - ry * nx;
      const w = 1 + (cross * cross) / inertia;
      const lambda = dist / w;
      x += nx * lambda;
      y += ny * lambda;
      rad += (lambda * cross) / inertia;
    }
    x = clamp(x, hw, state.width - hw);
    y = clamp(y, hh, state.rest.y);
  }
  state.vx = (x - x0) / dt;
  state.vy = (y - y0) / dt;
  state.spin = (((rad - rad0) / dt) * 180) / Math.PI;
  state.x = x;
  state.y = y;
  state.angle = (rad * 180) / Math.PI;
}

function stepFlying(state: TossState, dt: number, random: () => number, anchorOf: AnchorOf, events: TossEvent[]): void {
  const hw = halfWidth(state);
  const hh = halfHeight(state);
  const onFloorBefore = state.y >= state.rest.y - 0.01;
  state.vy += TOSS.gravity * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.angle += state.spin * dt;
  if (state.x < hw) {
    state.x = hw;
    bounce(state, state.vx, random, anchorOf, events);
    state.vx = -state.vx * state.physics.restitution;
    state.spin = -state.spin * state.physics.restitution;
  } else if (state.x > state.width - hw) {
    state.x = state.width - hw;
    bounce(state, state.vx, random, anchorOf, events);
    state.vx = -state.vx * state.physics.restitution;
    state.spin = -state.spin * state.physics.restitution;
  }
  if (state.y < hh) {
    state.y = hh;
    bounce(state, state.vy, random, anchorOf, events);
    state.vy = -state.vy * state.physics.restitution;
  }
  if (state.y >= state.rest.y) {
    state.y = state.rest.y;
    const impact = state.vy;
    if (impact > TOSS.bounceStop) {
      bounce(state, impact, random, anchorOf, events);
      state.vy = -impact * state.physics.floorRestitution;
      state.vx *= TOSS.floorFriction;
      state.spin *= 0.6;
    } else {
      // Too slow to bounce: it rolls to a stop on the floor.
      if (!onFloorBefore && impact > 0) events.push({ kind: "bounce", speed: impact });
      state.vy = 0;
      state.vx *= Math.max(0, 1 - TOSS.rollFriction * dt);
      state.spin *= Math.max(0, 1 - TOSS.rollFriction * dt);
      if (Math.abs(state.vx) < TOSS.restSpeed) {
        state.vx = 0;
        state.spin = 0;
        state.phase = "landing";
        state.phaseAt = 0;
        state.landFrom = ((((state.angle + 180) % 360) + 360) % 360) - 180;
        state.angle = state.landFrom;
        events.push({ kind: "land", loose: state.loose.length, thrown: state.thrown });
      }
    }
  }
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function stepLanding(state: TossState, dt: number, events: TossEvent[]): void {
  state.phaseAt += dt;
  const t = Math.min(1, state.phaseAt / TOSS.landingSeconds);
  state.angle = state.landFrom * (1 - easeOut(t));
  if (t < 1) return;
  state.angle = 0;
  state.phaseAt = 0;
  if (state.loose.length > 0) state.phase = "fetching";
  else if (Math.abs(state.x - state.rest.x) > 1) state.phase = "returning";
  else {
    state.x = state.rest.x;
    state.phase = "idle";
    state.facing = 0;
    events.push({ kind: "home", collected: 0 });
  }
}

/** Runs horizontally toward `targetX`; true once within `reach`, or against the wall that keeps it from getting closer. */
function runTo(state: TossState, targetX: number, reach: number, dt: number): boolean {
  const dx = targetX - state.x;
  if (Math.abs(dx) <= reach) {
    state.facing = 0;
    return true;
  }
  const step = Math.min(Math.abs(dx), TOSS.runSpeed * dt);
  state.facing = dx < 0 ? -1 : 1;
  const wanted = state.x + Math.sign(dx) * step;
  state.x = clamp(wanted, halfWidth(state), state.width - halfWidth(state));
  const blocked = state.x !== wanted;
  if (blocked || Math.abs(targetX - state.x) <= reach) {
    state.facing = 0;
    return true;
  }
  return false;
}

function stepFetching(state: TossState, dt: number, events: TossEvent[]): void {
  state.phaseAt += dt;
  if (state.wait > 0) {
    state.wait = Math.max(0, state.wait - dt);
    return;
  }
  // Nearest accessory already on the floor; the ones still bouncing are waited for.
  let target: LooseAccessory | null = null;
  for (const item of state.loose) {
    if (!item.settled) continue;
    if (!target || Math.abs(item.x - state.x) < Math.abs(target.x - state.x)) target = item;
  }
  if (!target) {
    state.facing = 0;
    return;
  }
  if (!runTo(state, target.x, TOSS.pickupDistance, dt)) return;
  state.loose = state.loose.filter((item) => item !== target);
  state.worn = sortOutfit([...state.worn, { slot: target.slot, id: target.id }]);
  state.wait = TOSS.pickupSeconds;
  state.picked += 1;
  events.push({ kind: "pickup", accessory: { slot: target.slot, id: target.id }, left: state.loose.length });
  if (state.loose.length === 0) {
    state.phase = "returning";
    state.phaseAt = 0;
  }
}

function stepReturning(state: TossState, dt: number, events: TossEvent[]): void {
  state.phaseAt += dt;
  if (state.wait > 0) {
    state.wait = Math.max(0, state.wait - dt);
    return;
  }
  if (!runTo(state, state.rest.x, Math.max(1, TOSS.runSpeed * dt), dt)) return;
  state.x = state.rest.x;
  state.facing = 0;
  state.phase = "idle";
  state.phaseAt = 0;
  events.push({ kind: "home", collected: state.picked });
}

function stepItems(state: TossState, dt: number): void {
  const half = itemHalf(state);
  const floor = itemFloor(state);
  for (const item of state.loose) {
    if (item.settled) continue;
    item.age += dt;
    item.vy += TOSS.item.gravity * dt;
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    item.angle += item.spin * dt;
    if (item.x < half) {
      item.x = half;
      item.vx = -item.vx * TOSS.item.restitution;
    } else if (item.x > state.width - half) {
      item.x = state.width - half;
      item.vx = -item.vx * TOSS.item.restitution;
    }
    if (item.y < half) {
      item.y = half;
      item.vy = -item.vy * TOSS.item.restitution;
    }
    if (item.y >= floor) {
      item.y = floor;
      if (item.vy > TOSS.item.restSpeed * 3) {
        item.vy = -item.vy * TOSS.item.restitution;
        item.vx *= TOSS.item.friction;
        item.spin *= 0.5;
      } else {
        item.vy = 0;
        item.vx *= Math.max(0, 1 - 6 * dt);
        item.spin *= Math.max(0, 1 - 6 * dt);
        if (Math.abs(item.vx) < TOSS.item.restSpeed) {
          item.vx = 0;
          item.spin = 0;
          item.settled = true;
        }
      }
    }
    if (item.age >= TOSS.item.maxSeconds) {
      item.y = floor;
      item.vx = 0;
      item.vy = 0;
      item.spin = 0;
      item.settled = true;
    }
  }
}

/**
 * Advances everything by `dt` seconds (call it in sub-steps of 50 ms at
 * most). `random` in [0, 1) scatters the fallen accessories; `anchorOf`
 * says where each slot sits on the drawing so an accessory falls from where
 * it was worn. Returns what happened, in order.
 */
export function stepToss(state: TossState, dt: number, random: () => number, anchorOf: AnchorOf): TossEvent[] {
  const events: TossEvent[] = [];
  if (dt <= 0) return events;
  switch (state.phase) {
    case "held":
      state.phaseAt += dt;
      stepHeld(state, dt);
      break;
    case "flying":
      state.phaseAt += dt;
      stepFlying(state, dt, random, anchorOf, events);
      break;
    case "landing":
      stepLanding(state, dt, events);
      break;
    case "fetching":
      stepFetching(state, dt, events);
      break;
    case "returning":
      stepReturning(state, dt, events);
      break;
    case "idle":
      break;
  }
  stepItems(state, dt);
  return events;
}
