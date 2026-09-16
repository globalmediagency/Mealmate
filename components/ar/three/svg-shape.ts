import * as THREE from "three";

/**
 * Turns the small SVG paths of the 2D creature drawings into Three.js shapes
 * (spec § 3.19, level 3), so the 3D volumes keep the exact silhouettes of the
 * ears, wings, gems and signature items. Supports the commands the drawings
 * use: M, L, C, Q, Z (absolute) and l, c, q (relative). The drawings are
 * y-down; the shapes come out y-up.
 */
type Command = { c: string; args: number[] };

function tokenize(d: string): Command[] {
  const out: Command[] = [];
  const re = /([MLCQZmlcqz])([^MLCQZmlcqz]*)/g;
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
  const px = (x: number) => x * k;
  const py = (y: number) => -y * k;
  for (const { c, args } of tokenize(d)) {
    const rel = c === c.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (c.toUpperCase()) {
      case "M":
        for (let i = 0; i + 1 < args.length; i += 2) {
          const x = ox + args[i];
          const y = oy + args[i + 1];
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
          cx = ox + args[i];
          cy = oy + args[i + 1];
          shape?.lineTo(px(cx), py(cy));
        }
        break;
      case "C":
        for (let i = 0; i + 5 < args.length; i += 6) {
          const x1 = ox + args[i];
          const y1 = oy + args[i + 1];
          const x2 = ox + args[i + 2];
          const y2 = oy + args[i + 3];
          cx = ox + args[i + 4];
          cy = oy + args[i + 5];
          shape?.bezierCurveTo(px(x1), py(y1), px(x2), py(y2), px(cx), py(cy));
        }
        break;
      case "Q":
        for (let i = 0; i + 3 < args.length; i += 4) {
          const x1 = ox + args[i];
          const y1 = oy + args[i + 1];
          cx = ox + args[i + 2];
          cy = oy + args[i + 3];
          shape?.quadraticCurveTo(px(x1), py(y1), px(cx), py(cy));
        }
        break;
      case "Z":
        shape?.closePath();
        cx = sx;
        cy = sy;
        break;
    }
  }
  return shapes;
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
