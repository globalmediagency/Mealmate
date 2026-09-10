import type { StageId } from "@/lib/game/config";
import type { BodyType, Point } from "@/lib/creatures/types";

/** Geometry of a body silhouette in the 100×100 viewBox (ground line ≈ y 92). */
export type Layout = {
  /** Round/tall bodies have a separate head circle that grows on babies. */
  hasDistinctHead: boolean;
  head: { cx: number; cy: number; r: number };
  body: { cx: number; cy: number; rx: number; ry: number; path?: string };
  eyeY: number;
  eyeGap: number;
  eyeScale: number;
  mouthY: number;
  cheekY: number;
  cheekGap: number;
  ears: { left: Point; right: Point; tilt: number };
  tail: Point;
  neck: Point;
  /** Topmost y of the head (halo, crown, leaf…). */
  top: number;
};

export const LAYOUTS: Record<BodyType, Layout> = {
  round: {
    hasDistinctHead: true,
    head: { cx: 50, cy: 40, r: 23 },
    body: { cx: 50, cy: 72, rx: 21, ry: 19 },
    eyeY: 40,
    eyeGap: 8.5,
    eyeScale: 1,
    mouthY: 49.5,
    cheekY: 46.5,
    cheekGap: 14,
    ears: { left: [36, 22], right: [64, 22], tilt: 0 },
    tail: [66, 78],
    neck: [50, 61],
    top: 17,
  },
  tall: {
    hasDistinctHead: true,
    head: { cx: 50, cy: 35, r: 20 },
    body: { cx: 50, cy: 70, rx: 17, ry: 22 },
    eyeY: 35,
    eyeGap: 7.5,
    eyeScale: 0.95,
    mouthY: 43.5,
    cheekY: 41,
    cheekGap: 12,
    ears: { left: [37, 18], right: [63, 18], tilt: 0 },
    tail: [63, 84],
    neck: [50, 55],
    top: 15,
  },
  blob: {
    hasDistinctHead: false,
    head: { cx: 50, cy: 44, r: 24 },
    body: {
      cx: 50,
      cy: 60,
      rx: 27,
      ry: 32,
      path: "M50 28 C33 28 23 42 23 60 C23 80 35 92 50 92 C65 92 77 80 77 60 C77 42 67 28 50 28 Z",
    },
    eyeY: 48,
    eyeGap: 9.5,
    eyeScale: 1.05,
    mouthY: 58,
    cheekY: 55,
    cheekGap: 15,
    ears: { left: [36, 33], right: [64, 33], tilt: 8 },
    tail: [72, 80],
    neck: [50, 66],
    top: 28,
  },
  egg: {
    hasDistinctHead: false,
    head: { cx: 50, cy: 40, r: 22 },
    body: {
      cx: 50,
      cy: 60,
      rx: 28,
      ry: 35,
      path: "M50 22 C31 22 22 46 22 64 C22 83 34 92 50 92 C66 92 78 83 78 64 C78 46 69 22 50 22 Z",
    },
    eyeY: 42,
    eyeGap: 9,
    eyeScale: 1,
    mouthY: 52,
    cheekY: 50,
    cheekGap: 14,
    ears: { left: [41, 26], right: [59, 26], tilt: 4 },
    tail: [73, 78],
    neck: [50, 60],
    top: 22,
  },
  serpent: {
    hasDistinctHead: true,
    head: { cx: 62, cy: 30, r: 14 },
    body: { cx: 50, cy: 76, rx: 26, ry: 14 },
    eyeY: 30,
    eyeGap: 6,
    eyeScale: 0.85,
    mouthY: 37,
    cheekY: 34,
    cheekGap: 9,
    ears: { left: [53, 18], right: [71, 18], tilt: 0 },
    tail: [28, 80],
    neck: [62, 44],
    top: 16,
  },
};

export type StageScales = { overall: number; head: number; face: number; body: number };

/** Proportions per growth stage (spec § 5.2). */
export function stageScales(stage: StageId, hasDistinctHead: boolean): StageScales {
  switch (stage) {
    case "bebe":
      return hasDistinctHead
        ? { overall: 0.72, head: 1.18, face: 1.05, body: 0.85 }
        : { overall: 0.72, head: 1, face: 1.18, body: 0.96 };
    case "enfant":
      return { overall: 0.86, head: 1, face: 1, body: 1 };
    case "adulte":
    case "sage":
      return { overall: 1, head: 1, face: 1, body: 1.08 };
  }
}

/** Deterministic pseudo-random in [0, 1) from a string (no hydration mismatch). */
export function hashUnit(input: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Colour helpers for palettes (hex → rgba string). */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Darkens/lightens a hex colour by a factor (-1 … 1). */
export function shade(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = Number.parseInt(full, 16);
  const channel = (value: number) => {
    const target = amount < 0 ? 0 : 255;
    const next = Math.round(value + (target - value) * Math.abs(amount));
    return Math.max(0, Math.min(255, next));
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
