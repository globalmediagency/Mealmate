import { describe, expect, it } from "vitest";
import { DEFENSE } from "./config";
import {
  bossesInWave,
  bossHitsFor,
  clampAim,
  computeDefenseScore,
  createDefense,
  eggPosition,
  endDefense,
  enemyDamage,
  fireDefense,
  JUNK_FOODS,
  JUNK_KINDS,
  kindsForWave,
  maxSpawnedThrough,
  spawnInterval,
  startDefense,
  stepDefense,
  waveEnemyCount,
  waveSpawnCount,
  waveSpeed,
  yawToward,
  type DefenseState,
} from "./defense";
import { DEFAULT_RULES } from "./rules";

/** Small deterministic generator (LCG) so the games replay identically. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function run(state: DefenseState, seconds: number, random = seeded(1), dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) stepDefense(state, dt, random);
}

describe("waves", () => {
  it("grow in numbers and speed, and unlock foods progressively", () => {
    expect(waveEnemyCount(1)).toBe(5);
    expect(waveEnemyCount(4)).toBe(11);
    expect(waveSpeed(1)).toBeCloseTo(0.32);
    expect(waveSpeed(3)).toBeCloseTo(0.32 * 1.24);
    expect(spawnInterval(1)).toBeCloseTo(1.8);
    expect(spawnInterval(20)).toBe(DEFENSE.minSpawnInterval);
    expect(kindsForWave(1)).toEqual(["burger", "pizza", "hotdog"]);
    expect(kindsForWave(5)).toEqual([...JUNK_KINDS]);
    expect(maxSpawnedThrough(2)).toBe(5 + 7);
    expect(maxSpawnedThrough(0)).toBe(0);
    expect(waveEnemyCount(2, { ...DEFAULT_RULES.defense, firstWaveEnemies: 3, enemiesGrowthPerWave: 0 })).toBe(3);
  });

  it("every junk food has a motion, a damage and a first wave", () => {
    for (const kind of JUNK_KINDS) {
      expect(JUNK_FOODS[kind].damage).toBeGreaterThan(0);
      expect(JUNK_FOODS[kind].wave).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("a game", () => {
  it("starts with an intro, then spawns the wave's foods in smoke", () => {
    const state = createDefense();
    expect(state.status).toBe("idle");
    stepDefense(state, 1); // nothing happens before the start
    expect(state.time).toBe(0);
    startDefense(state);
    expect(state.status).toBe("intro");
    expect(state.wave).toBe(1);
    run(state, DEFENSE.waveIntroSeconds + 0.05);
    expect(state.status).toBe("wave");
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0].phase).toBe("spawning");
    expect(state.effects.map((e) => e.kind)).toEqual(["smoke"]);
    expect(Math.hypot(state.enemies[0].x, state.enemies[0].y)).toBeCloseTo(DEFENSE.arenaRadius, 5);
    run(state, DEFENSE.smokeSeconds + 0.05);
    expect(state.enemies[0].phase).toBe("moving");
    expect(state.summary.spawned).toBe(1);
  });

  it("hurts the creature when a food gets through, and ends at 0 hp", () => {
    const state = createDefense({ ...DEFAULT_RULES.defense, hp: 30 });
    startDefense(state);
    // Straight foods only on wave 1: the slowest (burger ×0.85 ×0.9) needs (2.8 − 0.45) / 0.245 ≈ 9.6 s.
    run(state, DEFENSE.waveIntroSeconds + DEFENSE.smokeSeconds + 12);
    expect(state.summary.reached).toBeGreaterThan(0);
    expect(state.hp).toBeLessThan(30);
    expect(state.effects.some((e) => e.kind === "ouch") || state.status === "over").toBe(true);
    run(state, 20);
    expect(state.status).toBe("over");
    expect(state.hp).toBe(0);
  });

  it("destroys a food hit by an egg and scores", () => {
    const state = createDefense();
    startDefense(state);
    run(state, DEFENSE.waveIntroSeconds + DEFENSE.smokeSeconds + 0.5);
    const target = state.enemies[0];
    expect(target.phase).toBe("moving");
    // Aim a little ahead of it: it keeps moving toward the centre during the flight.
    const distance = Math.hypot(target.x, target.y);
    const flight = DEFENSE.eggFlightSeconds + DEFENSE.eggFlightPerSide * distance;
    const ahead = Math.max(0, distance - target.speed * flight);
    const aim = { x: (target.x / distance) * ahead, y: (target.y / distance) * ahead };
    expect(fireDefense(state, aim)).toBe(true);
    expect(state.eggs).toHaveLength(1);
    expect(state.yaw).toBeCloseTo(yawToward(aim));
    expect(eggPosition(state.eggs[0]).z).toBeCloseTo(1);
    run(state, flight + 0.1);
    expect(state.eggs).toHaveLength(0);
    expect(state.summary.destroyed).toBe(1);
    expect(state.score).toBe(DEFENSE.pointsPerFood);
    expect(state.enemies.some((e) => e.id === target.id)).toBe(false);
    expect(state.effects.some((e) => e.kind === "splat")).toBe(true);
  });

  it("reloads between two shots and refuses to fire before the start or after the end", () => {
    const state = createDefense();
    expect(fireDefense(state, { x: 1, y: 1 })).toBe(false);
    startDefense(state);
    expect(fireDefense(state, { x: 1, y: 1 })).toBe(true);
    expect(fireDefense(state, { x: 1, y: 1 })).toBe(false);
    run(state, DEFAULT_RULES.defense.fireCooldownMs / 1000 + 0.05);
    expect(fireDefense(state, { x: 1, y: 1 })).toBe(true);
    expect(state.summary.shots).toBe(2);
    endDefense(state);
    expect(state.status).toBe("over");
    expect(fireDefense(state, { x: 1, y: 1 })).toBe(false);
  });

  it("moves to the next wave once every food is gone", () => {
    const state = createDefense({ ...DEFAULT_RULES.defense, firstWaveEnemies: 1, enemiesGrowthPerWave: 1, fireCooldownMs: 0 });
    startDefense(state);
    run(state, DEFENSE.waveIntroSeconds + DEFENSE.smokeSeconds + 0.2);
    expect(state.enemies).toHaveLength(1);
    // Shoot every frame at the food's own position until it is gone (eggs land right on it).
    for (let i = 0; i < 600 && state.enemies.length > 0; i += 1) {
      const e = state.enemies[0];
      fireDefense(state, { x: e.x, y: e.y });
      stepDefense(state, 1 / 60, seeded(1));
    }
    expect(state.enemies).toHaveLength(0);
    expect(state.summary.wavesCleared).toBe(1);
    expect(state.wave).toBe(2);
    expect(state.status).toBe("intro");
    expect(state.toSpawn).toBe(2);
    expect(state.hp).toBe(DEFAULT_RULES.defense.hp);
  });

  it("replays identically with the same seed", () => {
    const a = createDefense();
    const b = createDefense();
    startDefense(a);
    startDefense(b);
    run(a, 12, seeded(7));
    run(b, 12, seeded(7));
    expect(a.enemies.map((e) => [e.kind, e.x, e.y])).toEqual(b.enemies.map((e) => [e.kind, e.x, e.y]));
  });
});

describe("boss timing", () => {
  it("lands on every slot of the wave over many games, never twice in one wave", () => {
    const rules = { ...DEFAULT_RULES.defense, firstWaveEnemies: 4, enemiesGrowthPerWave: 0, bossEveryWaves: 1, hp: 100000 };
    const slots = new Set<number>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = createDefense(rules);
      startDefense(state);
      const order: boolean[] = [];
      let known = 0;
      const random = seeded(seed);
      for (let t = 0; t < DEFENSE.waveIntroSeconds + spawnInterval(1) * 5 + 0.2 && order.length < 5; t += 1 / 60) {
        stepDefense(state, 1 / 60, random);
        if (state.summary.spawned > known) {
          order.push(state.enemies[state.enemies.length - 1].boss);
          known = state.summary.spawned;
        }
      }
      expect(order.filter(Boolean)).toHaveLength(1);
      slots.add(order.indexOf(true));
    }
    expect([...slots].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("aim and score", () => {
  it("clamps far aims to the reachable radius and faces the aim", () => {
    expect(clampAim({ x: 10, y: 0 })).toEqual({ x: DEFENSE.aimMaxRadius, y: 0 });
    expect(clampAim({ x: 1, y: -1 })).toEqual({ x: 1, y: -1 });
    expect(yawToward({ x: 0, y: -1 })).toBeCloseTo(0);
    expect(yawToward({ x: 1, y: 0 })).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(yawToward({ x: 0, y: 1 }))).toBeCloseTo(Math.PI);
  });

  it("scores the share of foods destroyed and never trusts more than the waves allow", () => {
    expect(computeDefenseScore({ spawned: 10, destroyed: 10, wavesCleared: 3 })).toEqual({ score: 100, perfect: true });
    expect(computeDefenseScore({ spawned: 5, destroyed: 5, wavesCleared: 0 })).toEqual({ score: 100, perfect: false });
    expect(computeDefenseScore({ spawned: 12, destroyed: 9, wavesCleared: 1 })).toEqual({ score: 75, perfect: false });
    expect(computeDefenseScore({ spawned: 0, destroyed: 0, wavesCleared: 0 })).toEqual({ score: 0, perfect: false });
    // Wave 1 alone cannot spawn 500 foods: the counters are bounded, then the ratio is honest.
    expect(computeDefenseScore({ spawned: 500, destroyed: 500, wavesCleared: 0 })).toEqual({ score: 100, perfect: false });
    expect(computeDefenseScore({ spawned: 5, destroyed: 50, wavesCleared: 0 }).score).toBe(100);
    expect(computeDefenseScore({ spawned: 5, destroyed: -3, wavesCleared: -2 }).score).toBe(0);
  });
});

describe("bosses", () => {
  const rules = { ...DEFAULT_RULES.defense, firstWaveEnemies: 1, enemiesGrowthPerWave: 0, bossEveryWaves: 1, bossHits: 3, fireCooldownMs: 0 };

  it("show up once in a boss wave, at a random moment, bigger, slower and tougher", () => {
    expect(bossesInWave(3)).toBe(1);
    expect(bossesInWave(4)).toBe(0);
    expect(bossesInWave(3, { ...DEFAULT_RULES.defense, bossEveryWaves: 0 })).toBe(0);
    expect(bossHitsFor(3)).toBe(3);
    expect(bossHitsFor(6)).toBe(4);
    expect(bossHitsFor(9)).toBe(5);
    expect(waveSpawnCount(3)).toBe(waveEnemyCount(3) + 1);
    expect(maxSpawnedThrough(3)).toBe(5 + 7 + 9 + 1);
    const state = createDefense(rules);
    startDefense(state);
    expect(state.toSpawn).toBe(2);
    run(state, DEFENSE.waveIntroSeconds + spawnInterval(1) + 0.1);
    expect(state.enemies).toHaveLength(2);
    expect(state.enemies.filter((e) => e.boss)).toHaveLength(1);
    const plain = state.enemies.find((e) => !e.boss)!;
    const boss = state.enemies.find((e) => e.boss)!;
    expect(boss.maxHits).toBe(3);
    expect(boss.scale).toBe(DEFENSE.bossScale);
    expect(boss.speed).toBeLessThan(plain.speed);
    expect(enemyDamage(boss)).toBe(JUNK_FOODS[boss.kind].damage * DEFENSE.bossDamageFactor);
    // Its smoke is as big as it is.
    expect(state.effects.filter((e) => e.kind === "smoke").some((e) => e.size === DEFENSE.bossScale)).toBe(true);
    run(state, DEFENSE.smokeSeconds + 0.2);
    expect(boss.phase).toBe("moving");
  });

  it("need several eggs, show a hit each time, and pay more when destroyed", () => {
    const state = createDefense(rules);
    startDefense(state);
    run(state, DEFENSE.waveIntroSeconds + spawnInterval(1) + DEFENSE.smokeSeconds + 0.3);
    const boss = state.enemies.find((e) => e.boss)!;
    let shots = 0;
    while (state.enemies.some((e) => e.id === boss.id) && shots < 50) {
      fireDefense(state, { x: boss.x, y: boss.y });
      shots += 1;
      run(state, DEFENSE.eggFlightSeconds + DEFENSE.eggFlightPerSide * 3 + 0.05);
      if (state.enemies.some((e) => e.id === boss.id)) {
        expect(boss.hits).toBe(3 - shots);
        expect(state.effects.some((e) => e.kind === "hit")).toBe(true);
      }
    }
    expect(shots).toBe(3);
    expect(state.summary.bosses).toBe(1);
    expect(state.score).toBeGreaterThanOrEqual(DEFENSE.pointsPerFood * 1 * 3);
  });
});
