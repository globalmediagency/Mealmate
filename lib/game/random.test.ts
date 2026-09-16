import { describe, expect, it } from "vitest";
import { createSeededRandom, randomSeed } from "./random";

describe("seeded random", () => {
  it("replays the same sequence from the same seed and resumes from a saved state", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    const saved = a.state();
    const tail = [a.next(), a.next()];
    const c = createSeededRandom(1);
    c.restore(saved);
    expect([c.next(), c.next()]).toEqual(tail);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createSeededRandom(0).next()).toBe(createSeededRandom(1).next());
    expect(randomSeed(() => 0.5)).toBe(Math.floor(0.5 * 0x7fffffff));
  });
});
