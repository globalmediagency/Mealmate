import * as THREE from "three";

/**
 * Turns the small SVG paths of the 2D creature drawings into Three.js shapes
 * (spec § 3.19, level 3), so the 3D volumes keep the exact silhouettes of the
 * ears, wings, gems, signature items and accessories. Supports the whole
 * path grammar the drawings use: M, L, H, V, C, S, Q, T, A and Z, absolute or
 * relative. The drawings are y-down; the shapes come out y-up. A subpath
 * closed by `Z` gets `autoClose = true`, so callers can tell outlines from
 * open strokes.
 */
type Command = { c: string; args: number[] };

const DEG = Math.PI / 180;
/** Segments drawn for a full turn of an arc. */
const ARC_SEGMENTS = 28;

function tokenize(d: string): Command[] {
  const out: Command[] = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const args = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    out.push({ c: m[1], args });
  }
  return out;
}

export type ShapeOptions = {
  /** Uniform scale applied to the path (1 = viewBox units). */
  scale?: number;
};

/** The subpaths of an SVG path as shapes (one per `M`), y flipped to point up. */
export function shapesFromPath(d: string, options: ShapeOptions = {}): THREE.Shape[] {
  const k = options.scale ?? 1;
  const shapes: THREE.Shape[] = [];
  let shape: THREE.Shape | null = null;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  // Last control point (for the smooth S / T commands) and the command that set it.
  let ctrlX = 0;
  let ctrlY = 0;
  let lastCmd = "";
  const px = (x: number) => x * k;
  const py = (y: number) => -y * k;
  for (const { c, args } of tokenize(d)) {
    const rel = c === c.toLowerCase();
    const ox = () => (rel ? cx : 0);
    const oy = () => (rel ? cy : 0);
    const cmd = c.toUpperCase();
    switch (cmd) {
      case "M":
        for (let i = 0; i + 1 < args.length; i += 2) {
          const x = ox() + args[i];
          const y = oy() + args[i + 1];
          if (i === 0) {
            shape = new THREE.Shape();
            shapes.push(shape);
            shape.moveTo(px(x), py(y));
            sx = x;
            sy = y;
          } else shape?.lineTo(px(x), py(y));
          cx = x;
          cy = y;
        }
        break;
      case "L":
        for (let i = 0; i + 1 < args.length; i += 2) {
          cx = ox() + args[i];
          cy = oy() + args[i + 1];
          shape?.lineTo(px(cx), py(cy));
        }
        break;
      case "H":
        for (const a of args) {
          cx = ox() + a;
          shape?.lineTo(px(cx), py(cy));
        }
        break;
      case "V":
        for (const a of args) {
          cy = oy() + a;
          shape?.lineTo(px(cx), py(cy));
        }
        break;
      case "C":
        for (let i = 0; i + 5 < args.length; i += 6) {
          const x1 = ox() + args[i];
          const y1 = oy() + args[i + 1];
          const x2 = ox() + args[i + 2];
          const y2 = oy() + args[i + 3];
          cx = ox() + args[i + 4];
          cy = oy() + args[i + 5];
          shape?.bezierCurveTo(px(x1), py(y1), px(x2), py(y2), px(cx), py(cy));
          ctrlX = x2;
          ctrlY = y2;
        }
        break;
      case "S":
        for (let i = 0; i + 3 < args.length; i += 4) {
          const reflect = lastCmd === "C" || lastCmd === "S";
          const x1 = reflect ? 2 * cx - ctrlX : cx;
          const y1 = reflect ? 2 * cy - ctrlY : cy;
          const x2 = ox() + args[i];
          const y2 = oy() + args[i + 1];
          cx = ox() + args[i + 2];
          cy = oy() + args[i + 3];
          shape?.bezierCurveTo(px(x1), py(y1), px(x2), py(y2), px(cx), py(cy));
          ctrlX = x2;
          ctrlY = y2;
        }
        break;
      case "Q":
        for (let i = 0; i + 3 < args.length; i += 4) {
          const x1 = ox() + args[i];
          const y1 = oy() + args[i + 1];
          cx = ox() + args[i + 2];
          cy = oy() + args[i + 3];
          shape?.quadraticCurveTo(px(x1), py(y1), px(cx), py(cy));
          ctrlX = x1;
          ctrlY = y1;
        }
        break;
      case "T":
        for (let i = 0; i + 1 < args.length; i += 2) {
          const reflect = lastCmd === "Q" || lastCmd === "T";
          const x1 = reflect ? 2 * cx - ctrlX : cx;
          const y1 = reflect ? 2 * cy - ctrlY : cy;
          cx = ox() + args[i];
          cy = oy() + args[i + 1];
          shape?.quadraticCurveTo(px(x1), py(y1), px(cx), py(cy));
          ctrlX = x1;
          ctrlY = y1;
        }
        break;
      case "A":
        for (let i = 0; i + 6 < args.length; i += 7) {
          const x = ox() + args[i + 5];
          const y = oy() + args[i + 6];
          if (shape) arc(shape, cx, cy, args[i], args[i + 1], args[i + 2], args[i + 3] !== 0, args[i + 4] !== 0, x, y, px, py);
          cx = x;
          cy = y;
        }
        break;
      case "Z":
        if (shape) {
          shape.closePath();
          shape.autoClose = true;
        }
        cx = sx;
        cy = sy;
        break;
    }
    lastCmd = cmd;
  }
  return shapes;
}

/** An SVG elliptical arc (endpoint form, W3C § F.6.5) as straight segments, from the current point to (x, y). */
function arc(
  shape: THREE.Shape,
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
  px: (v: number) => number,
  py: (v: number) => number,
) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0 || (x0 === x && y0 === y)) {
    shape.lineTo(px(x), py(y));
    return;
  }
  const phi = rotationDeg * DEG;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1 = cp * dx + sp * dy;
  const y1 = -sp * dx + cp * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1) / ry;
  const cyp = (coef * -ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (x0 + x) / 2;
  const cy = sp * cxp + cp * cyp + (y0 + y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1 - cxp) / rx;
  const uy = (y1 - cyp) / ry;
  const start = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(delta) / (2 * Math.PI)) * ARC_SEGMENTS));
  for (let k = 1; k <= n; k++) {
    const t = start + (delta * k) / n;
    const ex = cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp;
    const ey = cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp;
    shape.lineTo(px(ex), py(ey));
  }
}

/** Points along the first subpath of an SVG path (for tubes), y flipped to point up. */
export function pointsFromPath(d: string, divisions = 10, options: ShapeOptions = {}): THREE.Vector3[] {
  const shape = shapesFromPath(d, options)[0];
  if (!shape) return [];
  return shape.getPoints(divisions).map((p) => new THREE.Vector3(p.x, p.y, 0));
}

export type ExtrudeOptions = {
  depth?: number;
  bevel?: number;
};

/** A thin slab with the path's silhouette, centred on z = 0. */
export function extrudeGeometry(shapes: THREE.Shape[], options: ExtrudeOptions = {}): THREE.ExtrudeGeometry {
  const depth = options.depth ?? 2;
  const bevel = options.bevel ?? Math.min(0.6, depth * 0.3);
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}
