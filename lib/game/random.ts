/**
 * A small seeded generator whose state can be read and restored: the phones
 * of a "Défendre à deux" match replay the same waves from the same seed, and
 * a guest resumes from the host's state.
 */
export type SeededRandom = {
  next: () => number;
  /** Current internal state (an unsigned 32-bit integer). */
  state: () => number;
  restore: (state: number) => void;
};

const MODULUS = 4_294_967_296;

export function createSeededRandom(seed: number): SeededRandom {
  let s = (Math.floor(seed) >>> 0) || 1;
  return {
    next: () => {
      s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
      return s / MODULUS;
    },
    state: () => s,
    restore: (state: number) => {
      s = (Math.floor(state) >>> 0) || 1;
    },
  };
}

/** A fresh 31-bit seed. */
export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff);
}
