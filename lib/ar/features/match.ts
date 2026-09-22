import { DESCRIPTOR_WORDS } from "./orb";

export function popcount32(v: number): number {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Hamming distance between descriptor `a` of `A` and descriptor `b` of `B`. */
export function hamming(A: Uint32Array, a: number, B: Uint32Array, b: number): number {
  let d = 0;
  const oa = a * DESCRIPTOR_WORDS;
  const ob = b * DESCRIPTOR_WORDS;
  for (let k = 0; k < DESCRIPTOR_WORDS; k += 1) d += popcount32((A[oa + k] ^ B[ob + k]) >>> 0);
  return d;
}

export type Match = { query: number; train: number; distance: number };

export type MatchOptions = {
  /** Largest Hamming distance (bits) accepted. */
  maxDistance?: number;
  /** Best / second-best distance ratio above which a match is ambiguous. */
  ratio?: number;
  /** Two train points closer than this (in `trainPositions` units) count as the same spot: a second-best there is not an ambiguity. */
  sameSpot?: number;
};

/**
 * Brute-force matching of `query` descriptors against `train` ones, with
 * Lowe's ratio test. A reference holds the same physical corner at several
 * scales, so the second-best candidate only counts when it lies elsewhere
 * on the reference (`trainPositions`, interleaved x / y).
 */
export function matchDescriptors(query: Uint32Array, queryCount: number, train: Uint32Array, trainCount: number, trainPositions: Float32Array | null, options: MatchOptions = {}): Match[] {
  const maxDistance = options.maxDistance ?? 80;
  const ratio = options.ratio ?? 0.85;
  const sameSpot = options.sameSpot ?? 8;
  const matches: Match[] = [];
  const topIdx = [-1, -1, -1];
  const topDist = [257, 257, 257];
  for (let q = 0; q < queryCount; q += 1) {
    const oq = q * DESCRIPTOR_WORDS;
    const q0 = query[oq];
    const q1 = query[oq + 1];
    const q2 = query[oq + 2];
    const q3 = query[oq + 3];
    const q4 = query[oq + 4];
    const q5 = query[oq + 5];
    const q6 = query[oq + 6];
    const q7 = query[oq + 7];
    topIdx[0] = topIdx[1] = topIdx[2] = -1;
    topDist[0] = topDist[1] = topDist[2] = 257;
    for (let t = 0, ot = 0; t < trainCount; t += 1, ot += DESCRIPTOR_WORDS) {
      const d =
        popcount32((q0 ^ train[ot]) >>> 0) +
        popcount32((q1 ^ train[ot + 1]) >>> 0) +
        popcount32((q2 ^ train[ot + 2]) >>> 0) +
        popcount32((q3 ^ train[ot + 3]) >>> 0) +
        popcount32((q4 ^ train[ot + 4]) >>> 0) +
        popcount32((q5 ^ train[ot + 5]) >>> 0) +
        popcount32((q6 ^ train[ot + 6]) >>> 0) +
        popcount32((q7 ^ train[ot + 7]) >>> 0);
      if (d >= topDist[2]) continue;
      if (d < topDist[0]) {
        topDist[2] = topDist[1];
        topIdx[2] = topIdx[1];
        topDist[1] = topDist[0];
        topIdx[1] = topIdx[0];
        topDist[0] = d;
        topIdx[0] = t;
      } else if (d < topDist[1]) {
        topDist[2] = topDist[1];
        topIdx[2] = topIdx[1];
        topDist[1] = d;
        topIdx[1] = t;
      } else {
        topDist[2] = d;
        topIdx[2] = t;
      }
    }
    const best = topIdx[0];
    if (best < 0 || topDist[0] > maxDistance) continue;
    let second = 257;
    for (let r = 1; r < 3; r += 1) {
      const idx = topIdx[r];
      if (idx < 0) break;
      if (trainPositions) {
        const dx = trainPositions[2 * idx] - trainPositions[2 * best];
        const dy = trainPositions[2 * idx + 1] - trainPositions[2 * best + 1];
        if (Math.abs(dx) < sameSpot && Math.abs(dy) < sameSpot) continue;
      }
      second = topDist[r];
      break;
    }
    if (topDist[0] > ratio * second) continue;
    matches.push({ query: q, train: best, distance: topDist[0] });
  }
  return matches;
}
