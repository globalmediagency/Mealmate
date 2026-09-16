import type { FoodKind } from "@/lib/meals/food-icons";
import { DEFENSE } from "./config";
import { DEFAULT_RULES, type DefenseRules } from "./rules";

/**
 * "Défendre" (spec § 3.21): a tower-defense game played in augmented reality
 * on the creature's printed marker. Pure and deterministic: the scene only
 * draws this state, the server recomputes the reward from the summary.
 * Coordinates are in the marker's frame (x right, y toward the top edge,
 * z up), in marker sides; the creature stands at the origin.
 */
export type FoodMotion = "straight" | "zigzag" | "bounce" | "spiral";

export const JUNK_KINDS = ["burger", "pizza", "hotdog", "fries", "candy", "chips", "soda", "icecream", "milkshake", "donut", "cookie", "cake"] as const satisfies readonly FoodKind[];
export type JunkKind = (typeof JUNK_KINDS)[number];

export type JunkFood = {
  motion: FoodMotion;
  /** Health points taken from the creature when it gets through. */
  damage: number;
  /** Speed factor over the wave's speed. */
  speed: number;
  /** First wave where it shows up. */
  wave: number;
};

/** Every junk food: how it moves, how much it hurts and when it first appears. */
export const JUNK_FOODS: Record<JunkKind, JunkFood> = {
  burger: { motion: "straight", damage: 20, speed: 0.85, wave: 1 },
  pizza: { motion: "straight", damage: 20, speed: 1, wave: 1 },
  hotdog: { motion: "straight", damage: 15, speed: 1.15, wave: 1 },
  fries: { motion: "zigzag", damage: 10, speed: 1.1, wave: 2 },
  candy: { motion: "zigzag", damage: 10, speed: 1.3, wave: 2 },
  chips: { motion: "zigzag", damage: 10, speed: 1.05, wave: 2 },
  soda: { motion: "bounce", damage: 15, speed: 1, wave: 3 },
  icecream: { motion: "bounce", damage: 15, speed: 0.95, wave: 3 },
  milkshake: { motion: "bounce", damage: 15, speed: 0.9, wave: 3 },
  donut: { motion: "spiral", damage: 15, speed: 1, wave: 4 },
  cookie: { motion: "spiral", damage: 10, speed: 1.2, wave: 4 },
  cake: { motion: "straight", damage: 25, speed: 0.75, wave: 5 },
};

export type Vec2 = { x: number; y: number };

export type Enemy = {
  id: number;
  kind: JunkKind;
  motion: FoodMotion;
  /** Polar position around the creature: direction (radians) and distance. */
  angle: number;
  dist: number;
  /** Sideways offset (zigzag) and height (bounce). */
  lateral: number;
  z: number;
  /** Seconds since it started moving. */
  age: number;
  speed: number;
  /** Per-food variety (0–1): zigzag phase, spiral direction. */
  seed: number;
  phase: "spawning" | "moving";
  /** Cartesian position, refreshed by the step. */
  x: number;
  y: number;
  /** A boss: huge, slow, needs `maxHits` eggs (spec § 3.21). */
  boss: boolean;
  scale: number;
  /** Eggs still needed. */
  hits: number;
  maxHits: number;
  /** Collision radius added to the blast and reach radii. */
  radius: number;
};

export type Egg = {
  id: number;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  /** Flight progress 0–1. */
  t: number;
  duration: number;
};

export type EffectKind = "smoke" | "splat" | "ouch" | "hit";

export type Effect = { id: number; kind: EffectKind; x: number; y: number; z: number; age: number; duration: number; size: number };

export type DefenseSummary = {
  spawned: number;
  destroyed: number;
  reached: number;
  wavesCleared: number;
  shots: number;
  /** Bosses destroyed. */
  bosses: number;
};

export type DefenseStatus = "idle" | "intro" | "wave" | "over";

export type DefenseState = {
  status: DefenseStatus;
  wave: number;
  hp: number;
  score: number;
  /** Game clock (seconds), paused with the game. */
  time: number;
  enemies: Enemy[];
  eggs: Egg[];
  effects: Effect[];
  /** Direction the creature faces (radians about the paper's normal, 0 = the bottom edge). */
  yaw: number;
  summary: DefenseSummary;
  rules: DefenseRules;
  nextId: number;
  toSpawn: number;
  /** Bosses still to spawn in this wave (they come last). */
  bossToSpawn: number;
  spawnTimer: number;
  introTimer: number;
  lastFireAt: number;
};

const TAU = Math.PI * 2;

export function createDefense(rules: DefenseRules = DEFAULT_RULES.defense): DefenseState {
  return {
    status: "idle",
    wave: 0,
    hp: rules.hp,
    score: 0,
    time: 0,
    enemies: [],
    eggs: [],
    effects: [],
    yaw: 0,
    summary: { spawned: 0, destroyed: 0, reached: 0, wavesCleared: 0, shots: 0, bosses: 0 },
    rules,
    nextId: 1,
    toSpawn: 0,
    bossToSpawn: 0,
    spawnTimer: 0,
    introTimer: 0,
    lastFireAt: -Infinity,
  };
}

/** Plain foods in a wave (a boss may come on top, see `bossesInWave`). */
export function waveEnemyCount(wave: number, rules: DefenseRules = DEFAULT_RULES.defense): number {
  return Math.max(1, Math.round(rules.firstWaveEnemies + rules.enemiesGrowthPerWave * (wave - 1)));
}

/** Bosses closing a wave: one on every multiple of `bossEveryWaves`. */
export function bossesInWave(wave: number, rules: DefenseRules = DEFAULT_RULES.defense): number {
  return rules.bossEveryWaves > 0 && wave > 0 && wave % rules.bossEveryWaves === 0 ? 1 : 0;
}

/** Eggs needed by the boss of a wave: the base, plus one per boss already met. */
export function bossHitsFor(wave: number, rules: DefenseRules = DEFAULT_RULES.defense): number {
  if (rules.bossEveryWaves <= 0) return rules.bossHits;
  return Math.max(1, Math.round(rules.bossHits) + Math.max(0, Math.floor(wave / rules.bossEveryWaves) - 1));
}

/** Everything a wave spawns, bosses included. */
export function waveSpawnCount(wave: number, rules: DefenseRules = DEFAULT_RULES.defense): number {
  return waveEnemyCount(wave, rules) + bossesInWave(wave, rules);
}

/** Speed of a plain food in a wave (sides per second). */
export function waveSpeed(wave: number, rules: DefenseRules = DEFAULT_RULES.defense): number {
  return rules.baseSpeed * (1 + (rules.speedGrowthPercent / 100) * (wave - 1));
}

/** Seconds between two foods of a wave. */
export function spawnInterval(wave: number): number {
  return Math.max(DEFENSE.minSpawnInterval, DEFENSE.firstSpawnInterval - DEFENSE.spawnIntervalStepPerWave * (wave - 1));
}

/** Junk foods that may appear in a wave. */
export function kindsForWave(wave: number): JunkKind[] {
  return JUNK_KINDS.filter((kind) => JUNK_FOODS[kind].wave <= wave);
}

/** Most foods a game can have spawned once `wave` has started (server-side plausibility bound). */
export function maxSpawnedThrough(wave: number, rules: DefenseRules = DEFAULT_RULES.defense): number {
  let total = 0;
  for (let w = 1; w <= Math.max(0, Math.floor(wave)); w += 1) total += waveSpawnCount(w, rules);
  return total;
}

/** Facing angle toward a point of the paper (0 = toward the bottom edge, where the name is printed). */
export function yawToward(target: Vec2): number {
  return Math.atan2(target.x, -target.y);
}

/** Keeps the aim point within reach: beyond the arena it slides back along its direction. */
export function clampAim(point: Vec2, maxRadius = DEFENSE.aimMaxRadius): Vec2 {
  const r = Math.hypot(point.x, point.y);
  if (r <= maxRadius || r === 0) return point;
  return { x: (point.x / r) * maxRadius, y: (point.y / r) * maxRadius };
}

export function startDefense(state: DefenseState) {
  if (state.status !== "idle") return;
  beginWave(state, 1);
}

/** Ends the game early (the summary so far counts). */
export function endDefense(state: DefenseState) {
  if (state.status === "idle" || state.status === "over") return;
  state.status = "over";
}

function beginWave(state: DefenseState, wave: number) {
  state.wave = wave;
  state.status = "intro";
  state.introTimer = DEFENSE.waveIntroSeconds;
  state.bossToSpawn = bossesInWave(wave, state.rules);
  state.toSpawn = waveEnemyCount(wave, state.rules) + state.bossToSpawn;
  state.spawnTimer = 0;
}

function addEffect(state: DefenseState, kind: EffectKind, x: number, y: number, z: number, duration: number, size = 1) {
  state.effects.push({ id: state.nextId++, kind, x, y, z, age: 0, duration, size });
}

function spawnEnemy(state: DefenseState, random: () => number) {
  const kinds = kindsForWave(state.wave);
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(random() * kinds.length))];
  const food = JUNK_FOODS[kind];
  const angle = random() * TAU;
  // Bosses come last in their wave.
  const boss = state.bossToSpawn > 0 && state.toSpawn <= state.bossToSpawn;
  const hits = boss ? bossHitsFor(state.wave, state.rules) : 1;
  const enemy: Enemy = {
    id: state.nextId++,
    kind,
    motion: food.motion,
    angle,
    dist: DEFENSE.arenaRadius,
    lateral: 0,
    z: 0,
    age: -DEFENSE.smokeSeconds,
    speed: waveSpeed(state.wave, state.rules) * food.speed * (0.9 + 0.2 * random()) * (boss ? DEFENSE.bossSpeedFactor : 1),
    seed: random(),
    phase: "spawning",
    x: 0,
    y: 0,
    boss,
    scale: boss ? DEFENSE.bossScale : 1,
    hits,
    maxHits: hits,
    radius: boss ? DEFENSE.bossRadius : DEFENSE.foodRadius,
  };
  place(enemy);
  state.enemies.push(enemy);
  state.summary.spawned += 1;
  state.toSpawn -= 1;
  if (boss) state.bossToSpawn -= 1;
  addEffect(state, "smoke", enemy.x, enemy.y, 0.25 * enemy.scale, DEFENSE.smokeSeconds, enemy.scale);
}

/** Health points a food takes from the creature. */
export function enemyDamage(enemy: Pick<Enemy, "kind" | "boss">): number {
  return JUNK_FOODS[enemy.kind].damage * (enemy.boss ? DEFENSE.bossDamageFactor : 1);
}

function place(enemy: Enemy) {
  const cos = Math.cos(enemy.angle);
  const sin = Math.sin(enemy.angle);
  enemy.x = cos * enemy.dist - sin * enemy.lateral;
  enemy.y = sin * enemy.dist + cos * enemy.lateral;
}

function moveEnemy(enemy: Enemy, dt: number) {
  enemy.age += dt;
  if (enemy.age < 0) return; // still in its smoke
  enemy.phase = "moving";
  switch (enemy.motion) {
    case "straight":
      enemy.dist -= enemy.speed * dt;
      break;
    case "zigzag":
      enemy.dist -= enemy.speed * dt;
      enemy.lateral = 0.35 * Math.sin(4 * enemy.age + enemy.seed * TAU);
      break;
    case "bounce":
      enemy.dist -= enemy.speed * dt;
      enemy.z = 0.55 * Math.abs(Math.sin(5 * enemy.age));
      break;
    case "spiral": {
      enemy.dist -= enemy.speed * 0.85 * dt;
      const direction = enemy.seed < 0.5 ? 1 : -1;
      enemy.angle += (direction * enemy.speed * 1.2 * dt) / Math.max(0.6, enemy.dist);
      break;
    }
  }
  enemy.dist = Math.max(0, enemy.dist);
  place(enemy);
}

/** Position of an egg along its arc. */
export function eggPosition(egg: Egg): { x: number; y: number; z: number } {
  const t = Math.min(1, Math.max(0, egg.t));
  return {
    x: egg.from.x + (egg.to.x - egg.from.x) * t,
    y: egg.from.y + (egg.to.y - egg.from.y) * t,
    z: egg.from.z + (egg.to.z - egg.from.z) * t + DEFENSE.eggArcHeight * 4 * t * (1 - t),
  };
}

function land(state: DefenseState, egg: Egg) {
  addEffect(state, "splat", egg.to.x, egg.to.y, egg.to.z, 0.55);
  const survivors: Enemy[] = [];
  for (const enemy of state.enemies) {
    const near = enemy.phase === "moving" && Math.hypot(enemy.x - egg.to.x, enemy.y - egg.to.y) <= DEFENSE.blastRadius + enemy.radius && enemy.z <= DEFENSE.blastHeight;
    if (!near) {
      survivors.push(enemy);
      continue;
    }
    enemy.hits -= 1;
    if (enemy.hits > 0) {
      // A boss shrugs it off: it needs more eggs.
      addEffect(state, "hit", enemy.x, enemy.y, enemy.z + 0.45 * enemy.scale, 0.35, enemy.scale);
      survivors.push(enemy);
      continue;
    }
    state.summary.destroyed += 1;
    if (enemy.boss) state.summary.bosses += 1;
    state.score += DEFENSE.pointsPerFood * state.wave * enemy.maxHits;
  }
  state.enemies = survivors;
}

/**
 * Advances the game by `dt` seconds. `random` feeds the spawns (kind, angle,
 * speed variety), so a seeded generator gives a reproducible game.
 */
export function stepDefense(state: DefenseState, dt: number, random: () => number = Math.random) {
  if (state.status === "idle" || state.status === "over" || dt <= 0) return;
  state.time += dt;
  if (state.status === "intro") {
    state.introTimer -= dt;
    if (state.introTimer <= 0) state.status = "wave";
  }
  if (state.status === "wave" && state.toSpawn > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state, random);
      state.spawnTimer = spawnInterval(state.wave);
    }
  }
  // Foods move and may reach the creature.
  const survivors: Enemy[] = [];
  for (const enemy of state.enemies) {
    moveEnemy(enemy, dt);
    if (enemy.phase === "moving" && enemy.dist <= DEFENSE.reachRadius + enemy.radius) {
      state.hp = Math.max(0, state.hp - enemyDamage(enemy));
      state.summary.reached += 1;
      addEffect(state, "ouch", 0, 0, 0.9, 0.45, enemy.scale);
    } else survivors.push(enemy);
  }
  state.enemies = survivors;
  // Eggs fly and land.
  const flying: Egg[] = [];
  for (const egg of state.eggs) {
    egg.t += dt / egg.duration;
    if (egg.t >= 1) land(state, egg);
    else flying.push(egg);
  }
  state.eggs = flying;
  // Effects age out.
  for (const effect of state.effects) effect.age += dt;
  state.effects = state.effects.filter((e) => e.age < e.duration);
  if (state.hp <= 0) {
    state.status = "over";
    return;
  }
  if (state.status === "wave" && state.toSpawn === 0 && state.enemies.length === 0) {
    state.summary.wavesCleared += 1;
    beginWave(state, state.wave + 1);
  }
}

/**
 * Throws an egg toward a point of the paper: the creature turns to face it and
 * the egg lands there after a short arc. Returns false while reloading.
 */
export function fireDefense(state: DefenseState, target: Vec2): boolean {
  if (state.status !== "wave" && state.status !== "intro") return false;
  if (state.time - state.lastFireAt < state.rules.fireCooldownMs / 1000) return false;
  const aim = clampAim(target);
  state.lastFireAt = state.time;
  state.yaw = yawToward(aim);
  state.summary.shots += 1;
  const distance = Math.hypot(aim.x, aim.y);
  const dir = distance > 0 ? { x: aim.x / distance, y: aim.y / distance } : { x: 0, y: -1 };
  state.eggs.push({
    id: state.nextId++,
    from: { x: dir.x * 0.3, y: dir.y * 0.3, z: 1 },
    to: { x: aim.x, y: aim.y, z: 0.12 },
    t: 0,
    duration: DEFENSE.eggFlightSeconds + DEFENSE.eggFlightPerSide * distance,
  });
  return true;
}

/**
 * Reward score 0–100 from the raw counters (never from a client score): the
 * share of foods destroyed. Perfect = everything destroyed over at least
 * `DEFENSE.perfectWaves` cleared waves.
 */
export function computeDefenseScore(summary: Pick<DefenseSummary, "spawned" | "destroyed" | "wavesCleared">, rules: DefenseRules = DEFAULT_RULES.defense): { score: number; perfect: boolean } {
  const wavesCleared = Math.max(0, Math.floor(summary.wavesCleared));
  const spawned = Math.max(0, Math.min(Math.floor(summary.spawned), maxSpawnedThrough(wavesCleared + 1, rules)));
  const destroyed = Math.max(0, Math.min(spawned, Math.floor(summary.destroyed)));
  const score = spawned > 0 ? Math.round((destroyed / spawned) * 100) : 0;
  return { score, perfect: score >= 100 && wavesCleared >= DEFENSE.perfectWaves };
}
