/**
 * "Arène" (spec § 3.22), the part each phone animates on its own: eggs in
 * flight, tongues, short effects. The referee state (health, bonuses, ranks)
 * comes from the server; this state only exists between two polls. Every
 * position is expressed in the frame of one marker (`marker`), in marker
 * sides, so the drawing follows the paper it belongs to.
 */
import { ARENA, DEFENSE } from "./config";
import { tongueExtension, type EffectKind, type Vec2 } from "./defense";

export type Vec3 = { x: number; y: number; z: number };

export type LocalEgg = {
  id: number;
  /** Marker whose frame holds the flight. */
  marker: number;
  from: Vec3;
  to: Vec3;
  /** Flight progress 0–1. */
  t: number;
  duration: number;
  /** Thrown by this phone: judged at landing and reported to the server. Others' eggs are only drawn. */
  own: boolean;
  /** The creature aimed at (its marker and owner), null when the egg lands on the table. */
  targetMarker: number | null;
  targetUserId: string | null;
  landed: boolean;
};

export type LocalTongue = {
  id: number;
  /** The creature whose tongue it is (its marker). */
  marker: number;
  dir: Vec2;
  length: number;
  /** Motion progress 0–1. */
  t: number;
  own: boolean;
  /** Whether the catch at full extension has been resolved. */
  caught: boolean;
};

export type LocalEffect = { id: number; marker: number; kind: EffectKind; x: number; y: number; z: number; age: number; duration: number; size: number };

export type ArenaLocalState = {
  /** Local clock (seconds), paused with the game. */
  time: number;
  nextId: number;
  eggs: LocalEgg[];
  tongues: LocalTongue[];
  effects: LocalEffect[];
  lastShotAt: number;
  lastTongueAt: number;
  /** Where the player's creature looks (radians about the paper's normal). */
  yaw: number;
  shots: number;
};

export type LocalStep = {
  /** Eggs that just landed: the caller judges the own ones and draws the splat of the others. */
  landed: LocalEgg[];
  /** Own tongues that just reached full extension, for the caller to resolve the catch. */
  caught: LocalTongue[];
};

const EFFECT_SECONDS: Record<EffectKind, number> = { smoke: DEFENSE.smokeSeconds, splat: 0.5, ouch: 0.45, hit: 0.35, heal: 0.6 };

export function createArenaLocal(): ArenaLocalState {
  return { time: 0, nextId: 1, eggs: [], tongues: [], effects: [], lastShotAt: -Infinity, lastTongueAt: -Infinity, yaw: 0, shots: 0 };
}

export function addLocalEffect(state: ArenaLocalState, marker: number, kind: EffectKind, x: number, y: number, z: number, size = 1): LocalEffect {
  const effect: LocalEffect = { id: state.nextId++, marker, kind, x, y, z, age: 0, duration: EFFECT_SECONDS[kind], size };
  state.effects.push(effect);
  return effect;
}

/** Flight time of an egg over `distance` marker sides. */
export function eggFlightSeconds(distance: number): number {
  return DEFENSE.eggFlightSeconds + DEFENSE.eggFlightPerSide * distance;
}

export type LocalEggInput = Pick<LocalEgg, "marker" | "from" | "to" | "own" | "targetMarker" | "targetUserId">;

export function addLocalEgg(state: ArenaLocalState, input: LocalEggInput): LocalEgg {
  const distance = Math.hypot(input.to.x - input.from.x, input.to.y - input.from.y, input.to.z - input.from.z);
  const egg: LocalEgg = { id: state.nextId++, ...input, t: 0, duration: eggFlightSeconds(distance), landed: false };
  state.eggs.push(egg);
  return egg;
}

export function canShoot(state: ArenaLocalState): boolean {
  return (state.time - state.lastShotAt) * 1000 >= ARENA.shotCooldownMs;
}

/** The player's own egg, when the cooldown allows it: the creature turns toward the landing point. */
export function shootLocal(state: ArenaLocalState, input: Omit<LocalEggInput, "own">): LocalEgg | null {
  if (!canShoot(state)) return null;
  state.lastShotAt = state.time;
  state.shots += 1;
  return addLocalEgg(state, { ...input, own: true });
}

export function canLick(state: ArenaLocalState): boolean {
  return (state.time - state.lastTongueAt) * 1000 >= DEFENSE.tongueCooldownMs && !state.tongues.some((t) => t.own);
}

export type LocalTongueInput = Pick<LocalTongue, "marker" | "dir" | "length" | "own">;

export function addLocalTongue(state: ArenaLocalState, input: LocalTongueInput): LocalTongue {
  const tongue: LocalTongue = { id: state.nextId++, ...input, t: 0, caught: false };
  state.tongues.push(tongue);
  return tongue;
}

/** The player's own tongue toward `target` (in the player's marker frame), one at a time. */
export function lickLocal(state: ArenaLocalState, marker: number, target: Vec2): LocalTongue | null {
  if (!canLick(state)) return null;
  const distance = Math.hypot(target.x, target.y);
  if (distance < 1e-6) return null;
  state.lastTongueAt = state.time;
  const length = Math.max(DEFENSE.tongueMinLength, Math.min(DEFENSE.tongueMaxLength, distance));
  return addLocalTongue(state, { marker, dir: { x: target.x / distance, y: target.y / distance }, length, own: true });
}

/** Advances eggs, tongues and effects by `dt` seconds. */
export function stepArenaLocal(state: ArenaLocalState, dt: number): LocalStep {
  state.time += dt;
  const landed: LocalEgg[] = [];
  const caught: LocalTongue[] = [];
  for (const egg of state.eggs) {
    egg.t = Math.min(1, egg.t + dt / egg.duration);
    if (egg.t >= 1 && !egg.landed) {
      egg.landed = true;
      landed.push(egg);
    }
  }
  state.eggs = state.eggs.filter((e) => !e.landed);
  for (const tongue of state.tongues) {
    const before = tongue.t;
    tongue.t = Math.min(1, tongue.t + dt / DEFENSE.tongueSeconds);
    if (!tongue.caught && before < DEFENSE.tongueExtendFraction && tongue.t >= DEFENSE.tongueExtendFraction) {
      tongue.caught = true;
      if (tongue.own) caught.push(tongue);
    }
  }
  state.tongues = state.tongues.filter((t) => t.t < 1);
  for (const effect of state.effects) effect.age += dt;
  state.effects = state.effects.filter((e) => e.age < e.duration);
  return { landed, caught };
}

/** The tongue's reach right now, in marker sides from the creature's centre. */
export function localTongueReach(tongue: LocalTongue): number {
  return tongue.length * tongueExtension(tongue.t);
}

/** Good foods the tongue sweeps at full extension: within the corridor of the segment centre → tip. */
export function sweptByTongue<T extends { x: number; y: number }>(tongue: LocalTongue, items: T[]): T[] {
  const tipX = tongue.dir.x * tongue.length;
  const tipY = tongue.dir.y * tongue.length;
  const radius = DEFENSE.tongueRadius + DEFENSE.goodRadius;
  return items.filter((item) => {
    const dx = tipX;
    const dy = tipY;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (item.x * dx + item.y * dy) / len2));
    return Math.hypot(item.x - dx * t, item.y - dy * t) <= radius;
  });
}
