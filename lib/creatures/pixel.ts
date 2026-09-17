import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import type { SpeciesAnchors } from "./types";

/**
 * Pixel-art species (the Zodiaque collection, spec § 3.4): a creature is a
 * 28 × 28 grid of characters, one per cell, drawn in a four-tone monochrome
 * palette like an old handheld console. The same grid feeds the SVG renderer
 * (`components/creatures/pixel-creature.tsx`) and the 3D voxels
 * (`components/ar/three/pixel-mesh.ts`).
 *
 * Characters: `.` empty · `0` darkest (outlines) · `1` dark · `2` main tone ·
 * `3` lightest · `E` an eye cell (drawn darkest, closed by the lids, its
 * top-left cell gets the highlight) · `M` a mouth cell (drawn darkest).
 * Row 26 stands on the ground line (y = 92 of the 100 × 100 viewBox), row 0
 * is the top of the tallest ears.
 */
export const PIXEL_GRID = 28;
/** Side of one cell in viewBox units (28 cells = 77 units, like the drawn creatures). */
export const PIXEL_CELL = 2.75;
/** Rows 0..26 stand on the ground line at y = 92; row 27 is spare. */
export const PIXEL_TOP = 92 - (PIXEL_GRID - 1) * PIXEL_CELL;
export const PIXEL_LEFT = 50 - (PIXEL_GRID * PIXEL_CELL) / 2;

export type PixelTone = 0 | 1 | 2 | 3;

export type PixelArt = {
  /** 28 rows of 28 characters. */
  rows: readonly string[];
  /** Row where a hat sits (top of the skull, default: the topmost cell). */
  crown?: number;
  /** Row of the neck (collars, scarves; default: five rows under the eyes). */
  neck?: number;
};

/** A horizontal run of cells of one tone (cell coordinates). */
export type PixelRun = { x: number; y: number; w: number };
/** Bounding box in cells. */
export type PixelBox = { x: number; y: number; w: number; h: number };

export type PixelSprite = {
  /** Filled runs per tone; eye and mouth cells count as the main tone here (what shows under a closed lid). */
  runs: Record<PixelTone, PixelRun[]>;
  /** Each eye: its cells, its box and the cell that gets the highlight. */
  eyes: { cells: PixelRun[]; box: PixelBox; highlight: { x: number; y: number } }[];
  mouth: PixelRun[];
  /** Occupied cells. */
  bounds: PixelBox;
  /** Rows, in cells. */
  crown: number;
  neck: number;
  eyeCentre: { x: number; y: number };
  anchors: SpeciesAnchors;
};

/** Four tones per state, darkest first, plus the flat silhouette. */
export const PIXEL_PALETTES: Record<CreatureState, readonly [string, string, string, string]> = {
  healthy: ["#2a2c1f", "#5a5d44", "#8f9270", "#c6c8a2"],
  tired: ["#26282c", "#4f5560", "#7f8794", "#b4bcc6"],
  sick: ["#2c2e17", "#616a2b", "#9aa64a", "#d2d98e"],
  dead: ["#2a2a2a", "#4d4d4d", "#777777", "#a5a5a5"],
};
export const PIXEL_SILHOUETTE = "#303a30";

/** Whole-creature scale per stage (about the feet), pixel creatures having no separate head to grow. */
export function pixelStageScale(stage: StageId): number {
  switch (stage) {
    case "bebe":
      return 0.66;
    case "enfant":
      return 0.82;
    default:
      return 1;
  }
}

/** Centre of a cell in viewBox units. */
export const pixelX = (col: number) => PIXEL_LEFT + (col + 0.5) * PIXEL_CELL;
export const pixelY = (row: number) => PIXEL_TOP + (row + 0.5) * PIXEL_CELL;

const cache = new WeakMap<PixelArt, PixelSprite>();

/** Reads a grid once (cached by object identity). Throws on a malformed grid so the species test catches it. */
export function parsePixelArt(art: PixelArt): PixelSprite {
  const cached = cache.get(art);
  if (cached) return cached;
  const sprite = parse(art);
  cache.set(art, sprite);
  return sprite;
}

function parse(art: PixelArt): PixelSprite {
  const { rows } = art;
  if (rows.length !== PIXEL_GRID) throw new Error(`pixel art: ${rows.length} rows, expected ${PIXEL_GRID}`);
  const runs: Record<PixelTone, PixelRun[]> = { 0: [], 1: [], 2: [], 3: [] };
  const mouth: PixelRun[] = [];
  const eyeCells = new Set<string>();
  let top = PIXEL_GRID;
  let bottom = -1;
  let left = PIXEL_GRID;
  let right = -1;
  rows.forEach((row, y) => {
    if (row.length !== PIXEL_GRID) throw new Error(`pixel art: row ${y} has ${row.length} characters, expected ${PIXEL_GRID}`);
    let current: { tone: PixelTone; run: PixelRun } | null = null;
    let mouthRun: PixelRun | null = null;
    for (let x = 0; x < PIXEL_GRID; x++) {
      const ch = row[x];
      const tone = toneOf(ch, x, y);
      if (tone === null) {
        current = null;
        mouthRun = null;
        continue;
      }
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
      if (current && current.tone === tone && current.run.x + current.run.w === x) current.run.w += 1;
      else {
        current = { tone, run: { x, y, w: 1 } };
        runs[tone].push(current.run);
      }
      if (ch === "E") eyeCells.add(`${x},${y}`);
      if (ch === "M") {
        if (mouthRun && mouthRun.x + mouthRun.w === x) mouthRun.w += 1;
        else {
          mouthRun = { x, y, w: 1 };
          mouth.push(mouthRun);
        }
      } else mouthRun = null;
    }
  });
  if (bottom < 0) throw new Error("pixel art: empty grid");
  const eyes = clusters(eyeCells);
  if (eyes.length === 0) throw new Error("pixel art: no eye cell (E)");
  const eyeCentre = {
    x: eyes.reduce((s, e) => s + e.box.x + e.box.w / 2, 0) / eyes.length,
    y: eyes.reduce((s, e) => s + e.box.y + e.box.h / 2, 0) / eyes.length,
  };
  const crown = art.crown ?? top;
  const neck = art.neck ?? Math.min(bottom, Math.round(eyeCentre.y) + 5);
  const bodyY = (neck + bottom + 1) / 2;
  const anchors: SpeciesAnchors = {
    head: [pixelX(eyeCentre.x - 0.5), PIXEL_TOP + crown * PIXEL_CELL],
    eyes: [pixelX(eyeCentre.x - 0.5), pixelY(eyeCentre.y - 0.5)],
    neck: [50, PIXEL_TOP + neck * PIXEL_CELL],
    body: [50, PIXEL_TOP + bodyY * PIXEL_CELL],
  };
  return { runs, eyes, mouth, bounds: { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }, crown, neck, eyeCentre, anchors };
}

function toneOf(ch: string, x: number, y: number): PixelTone | null {
  switch (ch) {
    case ".":
      return null;
    case "0":
      return 0;
    case "1":
      return 1;
    case "2":
    case "E":
    case "M":
      return 2;
    case "3":
      return 3;
    default:
      throw new Error(`pixel art: unexpected character "${ch}" at ${x},${y}`);
  }
}

/** Groups eye cells into eyes (4-connected), each with its runs, box and highlight cell (top-left). */
function clusters(cells: Set<string>): PixelSprite["eyes"] {
  const seen = new Set<string>();
  const out: PixelSprite["eyes"] = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const members: { x: number; y: number }[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const key = queue.pop() as string;
      const [x, y] = key.split(",").map(Number);
      members.push({ x, y });
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const k = `${nx},${ny}`;
        if (cells.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push(k);
        }
      }
    }
    members.sort((a, b) => a.y - b.y || a.x - b.x);
    const minX = Math.min(...members.map((m) => m.x));
    const maxX = Math.max(...members.map((m) => m.x));
    const minY = Math.min(...members.map((m) => m.y));
    const maxY = Math.max(...members.map((m) => m.y));
    const runs: PixelRun[] = [];
    for (const m of members) {
      const last = runs[runs.length - 1];
      if (last && last.y === m.y && last.x + last.w === m.x) last.w += 1;
      else runs.push({ x: m.x, y: m.y, w: 1 });
    }
    out.push({ cells: runs, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, highlight: members[0] });
  }
  return out.sort((a, b) => a.box.x - b.box.x);
}

/** Anchors of a pixel species (for its `Species` entry). */
export function pixelAnchors(art: PixelArt): SpeciesAnchors {
  return parsePixelArt(art).anchors;
}

/** An SVG path drawing every run as a crisp rectangle (viewBox units). */
export function pixelRunsPath(runs: readonly PixelRun[]): string {
  return runs.map((r) => `M${PIXEL_LEFT + r.x * PIXEL_CELL} ${PIXEL_TOP + r.y * PIXEL_CELL}h${r.w * PIXEL_CELL}v${PIXEL_CELL}h${-r.w * PIXEL_CELL}z`).join("");
}
