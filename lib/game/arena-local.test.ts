import { describe, expect, it } from "vitest";
import { ARENA, DEFENSE } from "./config";
import { addLocalEffect, addLocalEgg, canLick, canShoot, createArenaLocal, lickLocal, shootLocal, stepArenaLocal, sweptByTongue, VERDICT_GRACE_SECONDS } from "./arena-local";

describe("arena local animation", () => {
  it("throws one egg per cooldown and reports its landing once", () => {
    const state = createArenaLocal();
    const egg = shootLocal(state, { marker: 17, from: { x: 0, y: 0, z: 0.8 }, to: { x: 1, y: 0, z: 0 }, targetMarker: 42, targetUserId: "u2" });
    expect(egg).not.toBeNull();
    expect(shootLocal(state, { marker: 17, from: { x: 0, y: 0, z: 0.8 }, to: { x: 1, y: 0, z: 0 }, targetMarker: 42, targetUserId: "u2" })).toBeNull();
    stepArenaLocal(state, ARENA.shotCooldownMs / 1000);
    expect(canShoot(state)).toBe(true);
    let landed = 0;
    for (let i = 0; i < 40; i += 1) landed += stepArenaLocal(state, 0.05).landed.length;
    expect(landed).toBe(1);
    expect(state.eggs).toEqual([]);
    expect(state.shots).toBe(1);
  });

  it("reports the landing of the others' eggs too, flagged as not own", () => {
    const state = createArenaLocal();
    addLocalEgg(state, { marker: 42, from: { x: 0, y: 0, z: 1 }, to: { x: 0.2, y: 0, z: 0 }, own: false, targetMarker: 17, targetUserId: "me", hit: true });
    const landed: boolean[] = [];
    for (let i = 0; i < 40; i += 1) landed.push(...stepArenaLocal(state, 0.05).landed.map((e) => e.own));
    expect(landed).toEqual([false]);
    expect(state.eggs).toEqual([]);
  });

  it("holds a remote egg without a verdict a moment on its landing point, then judges it", () => {
    const state = createArenaLocal();
    const egg = addLocalEgg(state, { marker: 42, from: { x: 0, y: 0, z: 1 }, to: { x: 0.2, y: 0, z: 0 }, own: false, targetMarker: 17, targetUserId: "me" });
    let landedAt: number | null = null;
    let steps = 0;
    while (landedAt === null && steps < 100) {
      steps += 1;
      if (stepArenaLocal(state, 0.05).landed.length > 0) landedAt = state.time;
    }
    expect(landedAt).not.toBeNull();
    expect(landedAt!).toBeGreaterThanOrEqual(egg.duration + VERDICT_GRACE_SECONDS - 0.05);
    // A verdict that arrives meanwhile ends the wait at the next step.
    const quick = createArenaLocal();
    const other = addLocalEgg(quick, { marker: 42, from: { x: 0, y: 0, z: 1 }, to: { x: 0.2, y: 0, z: 0 }, own: false, targetMarker: 17, targetUserId: "me" });
    for (let i = 0; i < 12; i += 1) stepArenaLocal(quick, 0.05);
    expect(quick.eggs).toHaveLength(1);
    expect(other.t).toBe(1);
    other.hit = false;
    expect(stepArenaLocal(quick, 0.01).landed).toHaveLength(1);
  });

  it("sticks the tongue out once at a time and resolves the catch at full extension", () => {
    const state = createArenaLocal();
    const tongue = lickLocal(state, 17, { x: 3, y: 0 });
    expect(tongue?.length).toBe(DEFENSE.tongueMaxLength);
    expect(canLick(state)).toBe(false);
    expect(lickLocal(state, 17, { x: 1, y: 0 })).toBeNull();
    let caught = 0;
    for (let i = 0; i < 20; i += 1) caught += stepArenaLocal(state, 0.05).caught.length;
    expect(caught).toBe(1);
    expect(state.tongues).toEqual([]);
    stepArenaLocal(state, DEFENSE.tongueCooldownMs / 1000);
    expect(canLick(state)).toBe(true);
    expect(lickLocal(state, 17, { x: 0.5, y: 0 })?.length).toBe(DEFENSE.tongueMinLength);
  });

  it("keeps the foods on the tongue's path and drops the others", () => {
    const tongue = { id: 1, marker: 17, dir: { x: 1, y: 0 }, length: 2, t: 0.4, own: true, caught: true };
    const items = [
      { id: "near", x: 1, y: 0.1 },
      { id: "aside", x: 1, y: 0.9 },
      { id: "beyond", x: 2.8, y: 0 },
    ];
    expect(sweptByTongue(tongue, items).map((i) => i.id)).toEqual(["near"]);
  });

  it("forgets the effects after their duration", () => {
    const state = createArenaLocal();
    addLocalEffect(state, 17, "hit", 0, 0, 0.5);
    stepArenaLocal(state, 0.2);
    expect(state.effects).toHaveLength(1);
    stepArenaLocal(state, 0.3);
    expect(state.effects).toHaveLength(0);
  });
});
