import * as THREE from "three";
import { extrudeGeometry, shapesFromPath } from "./svg-shape";

/**
 * Turns one accessory drawing (the stand-alone SVG of `AccessoryLayerSvg`)
 * into a real volume (spec § 3.19, level 3): every filled area becomes a thin
 * slab with its exact silhouette, every line a tube, in the drawing's order
 * (each later element a touch in front of the previous ones), optionally
 * draped on a surface so the object hugs the creature. Groups and their
 * transforms (translate, scale, rotate, matrix), inherited fills and strokes,
 * opacities, `rgba()` colours, rounded rects, circles, ellipses, lines and
 * polygons are understood; anything else (classes, styles, text) is ignored.
 * The drawing is y-down; the volume comes out y-up, one drawing unit = one
 * local unit, the SVG origin (the accessory's anchor) at the group's origin.
 */

/** A 2D affine matrix [a, b, c, d, e, f] (SVG convention). */
type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const DEG = Math.PI / 180;
/** Segments per curve when sampling the outlines. */
const CURVE_DIVISIONS = 8;
/** Below this the drawing is invisible; kept out of the volume. */
const MIN_ALPHA = 0.02;
/** Translucent fills (glass lenses) are lifted to this opacity so the volume reads as glass. */
const GLASS_ALPHA = 0.18;
/** Longest edge kept in a draped slab (drawing units): shorter edges hug the surface more closely. */
const DRAPE_MAX_EDGE = 2.5;

type Paint = { color: string; alpha: number } | null;

type Style = {
  matrix: Mat;
  fill: Paint;
  stroke: Paint;
  strokeWidth: number;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  roundCaps: boolean;
  evenOdd: boolean;
};

type Subpath = { points: THREE.Vector2[]; closed: boolean };

export type SolidOptions = {
  /** Thickness of the filled areas (drawing units). Default 0.9. */
  depth?: number;
  /** Bevel of the slabs. Default 0.15. */
  bevel?: number;
  /** How far each later element sits in front of the previous one. Default 0.3. */
  step?: number;
  /** Which way is "in front": +1 (towards +z, a front layer) or −1 (a back layer, seen from behind). Default +1. */
  facing?: 1 | -1;
  /** Surface the drawing is draped on: extra z at a point of the drawing (y up), so the object hugs the creature. */
  drape?: (x: number, y: number) => number;
};

export type SolidResult = {
  group: THREE.Group;
  /** Extent of the drawing (y up, drawing units), null when nothing was drawn. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  /** The drawing's rightmost and leftmost points (y up). */
  rightmost: THREE.Vector2 | null;
  leftmost: THREE.Vector2 | null;
  /** The colour of its strongest line, or of its main filled area: what a frame or a strap continuing it should wear. */
  frameColor: string;
  dispose(): void;
};

const DRAWABLE = new Set(["path", "circle", "ellipse", "rect", "line", "polygon", "polyline"]);

/** The drawing as a volume, or null when the markup cannot be read (no DOMParser, empty drawing). */
export function solidFromSvg(markup: string, options: SolidOptions = {}): SolidResult | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg") return null;

  const depth = options.depth ?? 0.9;
  const bevel = options.bevel ?? 0.15;
  const step = options.step ?? 0.3;
  const facing = options.facing ?? 1;
  const drape = options.drape;

  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const materialFor = (color: string, alpha: number, glassy: boolean) => {
    const key = `${color}/${alpha.toFixed(3)}/${glassy ? "g" : "m"}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: glassy ? 0.2 : 0.6, metalness: 0 });
      if (alpha < 1) Object.assign(m, { transparent: true, opacity: alpha, depthWrite: alpha >= 0.5 });
      materials.set(key, m);
      disposables.push(m);
    }
    return m;
  };

  let index = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let rightmost: THREE.Vector2 | null = null;
  let leftmost: THREE.Vector2 | null = null;
  // What a frame or a strap continuing the drawing should wear: its strongest line, else its main filled area.
  const main: { line: { width: number; color: string } | null; fill: { area: number; color: string } | null } = { line: null, fill: null };

  const note = (p: THREE.Vector2) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    if (!rightmost || p.x > rightmost.x) rightmost = p.clone();
    if (!leftmost || p.x < leftmost.x) leftmost = p.clone();
  };

  const draw = (el: Element, style: Style) => {
    const d = pathData(el);
    if (!d) return;
    const subpaths = samplePaths(d, style.matrix);
    if (subpaths.length === 0) return;
    for (const sp of subpaths) for (const p of sp.points) note(p);
    const scale = Math.sqrt(Math.abs(style.matrix[0] * style.matrix[3] - style.matrix[1] * style.matrix[2]));
    const z = facing * index * step;
    index += 1;

    const fillAlpha = style.fill ? style.fill.alpha * style.opacity * style.fillOpacity : 0;
    const closed = subpaths.filter((sp) => sp.points.length >= 3);
    if (style.fill && fillAlpha > MIN_ALPHA && closed.length > 0) {
      const glassy = fillAlpha < GLASS_ALPHA;
      const alpha = glassy ? GLASS_ALPHA : fillAlpha;
      const shapes = shapesWithHoles(closed, style.evenOdd);
      let geometry: THREE.BufferGeometry = extrudeGeometry(shapes, { depth, bevel });
      if (drape) {
        // A slab only has vertices on its outline: refine it so its faces can follow the surface, then bend it.
        const refined = refineGeometry(geometry, DRAPE_MAX_EDGE);
        geometry.dispose();
        geometry = refined;
        drapeGeometry(geometry, drape);
      }
      disposables.push(geometry);
      const mesh = new THREE.Mesh(geometry, materialFor(style.fill.color, alpha, glassy));
      mesh.position.z = z;
      group.add(mesh);
      if (alpha >= 0.5) {
        const area = shapeArea(closed);
        if (!main.fill || area > main.fill.area) main.fill = { area, color: style.fill.color };
      }
    }

    const strokeAlpha = style.stroke ? style.stroke.alpha * style.opacity * style.strokeOpacity : 0;
    if (style.stroke && strokeAlpha > MIN_ALPHA && style.strokeWidth > 0) {
      const width = style.strokeWidth * scale;
      const radius = Math.max(0.28, width / 2);
      // An outline of a filled area sits on its front face; a bare line at the element's own depth.
      const lineZ = style.fill && fillAlpha > MIN_ALPHA ? z + (facing * depth) / 2 : z;
      const material = materialFor(style.stroke.color, strokeAlpha, false);
      for (const sp of subpaths) {
        if (sp.points.length < 2) continue;
        const points = sp.points.map((p) => new THREE.Vector3(p.x, p.y, lineZ + (drape ? drape(p.x, p.y) : 0)));
        const geometry = tubeGeometry(points, radius, sp.closed);
        if (!geometry) continue;
        disposables.push(geometry);
        group.add(new THREE.Mesh(geometry, material));
        if (style.roundCaps && !sp.closed) {
          const cap = new THREE.SphereGeometry(radius, 8, 6);
          disposables.push(cap);
          for (const end of [points[0], points[points.length - 1]]) {
            const s = new THREE.Mesh(cap, material);
            s.position.copy(end);
            group.add(s);
          }
        }
      }
      if (!main.line || width > main.line.width) main.line = { width, color: style.stroke.color };
    }
  };

  const walk = (el: Element, parent: Style) => {
    const style = deriveStyle(el, parent);
    const name = el.localName;
    if (name === "svg" || name === "g") {
      for (const child of Array.from(el.children)) walk(child, style);
    } else if (DRAWABLE.has(name)) draw(el, style);
  };
  walk(root, { matrix: IDENTITY, fill: { color: "#000000", alpha: 1 }, stroke: null, strokeWidth: 1, opacity: 1, fillOpacity: 1, strokeOpacity: 1, roundCaps: false, evenOdd: false });

  if (index === 0) return null;
  return {
    group,
    bounds: Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null,
    rightmost,
    leftmost,
    frameColor: main.line?.color ?? main.fill?.color ?? "#2B2B2B",
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Elements → path data

const num = (el: Element, name: string, fallback = 0) => {
  const v = el.getAttribute(name);
  if (v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Every drawable element as SVG path data (rounded rects, circles and ellipses through arcs). */
function pathData(el: Element): string | null {
  switch (el.localName) {
    case "path":
      return el.getAttribute("d");
    case "circle": {
      const cx = num(el, "cx");
      const cy = num(el, "cy");
      const r = num(el, "r");
      if (r <= 0) return null;
      return `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    }
    case "ellipse": {
      const cx = num(el, "cx");
      const cy = num(el, "cy");
      const rx = num(el, "rx");
      const ry = num(el, "ry");
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    case "rect": {
      const x = num(el, "x");
      const y = num(el, "y");
      const w = num(el, "width");
      const h = num(el, "height");
      if (w <= 0 || h <= 0) return null;
      const rx = Math.min(w / 2, num(el, "rx", num(el, "ry")));
      const ry = Math.min(h / 2, num(el, "ry", rx));
      if (rx <= 0 || ry <= 0) return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
      return [
        `M${x + rx} ${y}`,
        `L${x + w - rx} ${y}`,
        `A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`,
        `L${x + w} ${y + h - ry}`,
        `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`,
        `L${x + rx} ${y + h}`,
        `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`,
        `L${x} ${y + ry}`,
        `A${rx} ${ry} 0 0 1 ${x + rx} ${y}`,
        "Z",
      ].join(" ");
    }
    case "line":
      return `M${num(el, "x1")} ${num(el, "y1")} L${num(el, "x2")} ${num(el, "y2")}`;
    case "polygon":
    case "polyline": {
      const values = (el.getAttribute("points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      if (values.length < 4) return null;
      const parts = [`M${values[0]} ${values[1]}`];
      for (let i = 2; i + 1 < values.length; i += 2) parts.push(`L${values[i]} ${values[i + 1]}`);
      if (el.localName === "polygon") parts.push("Z");
      return parts.join(" ");
    }
    default:
      return null;
  }
}

/** The subpaths of a path sampled into points (y up), the element's transform applied in the drawing's y-down space. */
function samplePaths(d: string, matrix: Mat): Subpath[] {
  const out: Subpath[] = [];
  for (const shape of shapesFromPath(d)) {
    const closed = shape.autoClose;
    const points = shape.getPoints(CURVE_DIVISIONS).map((p) => {
      const [x, y] = applyMatrix(matrix, p.x, -p.y);
      return new THREE.Vector2(x, -y);
    });
    // Drop consecutive duplicates, and the closing point of an outline.
    const clean: THREE.Vector2[] = [];
    for (const p of points) if (clean.length === 0 || clean[clean.length - 1].distanceToSquared(p) > 1e-8) clean.push(p);
    if (closed && clean.length > 2 && clean[0].distanceToSquared(clean[clean.length - 1]) <= 1e-8) clean.pop();
    if (clean.length >= 2) out.push({ points: clean, closed });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fills

/** Shapes to extrude: a subpath drawn inside an earlier one is a hole (even-odd rule, or opposite winding). */
function shapesWithHoles(subpaths: Subpath[], evenOdd: boolean): THREE.Shape[] {
  const shapes: { shape: THREE.Shape; points: THREE.Vector2[]; clockwise: boolean }[] = [];
  for (const sp of subpaths) {
    const clockwise = THREE.ShapeUtils.isClockWise(sp.points);
    const outer = shapes.find((s) => pointInPolygon(sp.points[0], s.points));
    if (outer && (evenOdd || outer.clockwise !== clockwise)) {
      outer.shape.holes.push(new THREE.Path(sp.points));
    } else {
      shapes.push({ shape: new THREE.Shape(sp.points), points: sp.points, clockwise });
    }
  }
  return shapes.map((s) => s.shape);
}

function pointInPolygon(p: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function shapeArea(subpaths: Subpath[]): number {
  let area = 0;
  for (const sp of subpaths) area += Math.abs(THREE.ShapeUtils.area(sp.points));
  return area;
}

/** Splits every triangle until no edge is longer than `maxEdge` (positions only, flat shading). */
function refineGeometry(geometry: THREE.BufferGeometry, maxEdge: number): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.attributes.position;
  const out: number[] = [];
  const limit = maxEdge * maxEdge;
  const emit = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, level: number) => {
    if (level < 6 && Math.max(p.distanceToSquared(q), q.distanceToSquared(r), r.distanceToSquared(p)) > limit) {
      const pq = p.clone().lerp(q, 0.5);
      const qr = q.clone().lerp(r, 0.5);
      const rp = r.clone().lerp(p, 0.5);
      emit(p, pq, rp, level + 1);
      emit(pq, q, qr, level + 1);
      emit(rp, qr, r, level + 1);
      emit(pq, qr, rp, level + 1);
    } else out.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };
  for (let i = 0; i + 2 < position.count; i += 3) {
    emit(new THREE.Vector3().fromBufferAttribute(position, i), new THREE.Vector3().fromBufferAttribute(position, i + 1), new THREE.Vector3().fromBufferAttribute(position, i + 2), 0);
  }
  if (source !== geometry) source.dispose();
  const refined = new THREE.BufferGeometry();
  refined.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return refined;
}

/** Bends a slab along a surface: every vertex is pushed by the surface's height under it. */
function drapeGeometry(geometry: THREE.BufferGeometry, drape: (x: number, y: number) => number) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setZ(i, position.getZ(i) + drape(position.getX(i), position.getY(i)));
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// Strokes

/** A tube along a polyline (straight pieces), closed when the outline is. */
function tubeGeometry(points: THREE.Vector3[], radius: number, closed: boolean): THREE.TubeGeometry | null {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i + 1 < points.length; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  if (closed) path.add(new THREE.LineCurve3(points[points.length - 1], points[0]));
  if (path.curves.length === 0) return null;
  return new THREE.TubeGeometry(path, Math.max(6, path.curves.length * 2), radius, 6, closed);
}

// ---------------------------------------------------------------------------
// Styles and transforms

function deriveStyle(el: Element, parent: Style): Style {
  const opacity = attrNumber(el, "opacity");
  const fillOpacity = attrNumber(el, "fill-opacity");
  const strokeOpacity = attrNumber(el, "stroke-opacity");
  const strokeWidth = attrNumber(el, "stroke-width");
  const linecap = el.getAttribute("stroke-linecap");
  const fillRule = el.getAttribute("fill-rule");
  return {
    matrix: multiply(parent.matrix, parseTransform(el.getAttribute("transform"))),
    fill: parsePaint(el.getAttribute("fill"), parent.fill),
    stroke: parsePaint(el.getAttribute("stroke"), parent.stroke),
    strokeWidth: strokeWidth ?? parent.strokeWidth,
    opacity: parent.opacity * (opacity ?? 1),
    fillOpacity: parent.fillOpacity * (fillOpacity ?? 1),
    strokeOpacity: parent.strokeOpacity * (strokeOpacity ?? 1),
    roundCaps: linecap ? linecap === "round" : parent.roundCaps,
    evenOdd: fillRule ? fillRule === "evenodd" : parent.evenOdd,
  };
}

function attrNumber(el: Element, name: string): number | null {
  const v = el.getAttribute(name);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `none`, hex colours, named colours and `rgb()` / `rgba()` (whose alpha is kept). */
function parsePaint(value: string | null, inherited: Paint): Paint {
  if (value === null || value === "" || value === "inherit") return inherited;
  const v = value.trim();
  if (v === "none" || v === "transparent") return null;
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (rgba) {
    const hex = [rgba[1], rgba[2], rgba[3]].map((c) => Math.max(0, Math.min(255, Math.round(Number(c)))).toString(16).padStart(2, "0")).join("");
    return { color: `#${hex}`, alpha: rgba[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgba[4]))) };
  }
  return { color: v, alpha: 1 };
}

function parseTransform(value: string | null): Mat {
  let m: Mat = IDENTITY;
  if (!value) return m;
  const re = /(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const a = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Mat = IDENTITY;
    switch (match[1]) {
      case "translate":
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case "scale":
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const c = Math.cos((a[0] ?? 0) * DEG);
        const s = Math.sin((a[0] ?? 0) * DEG);
        t = [c, s, -s, c, 0, 0];
        if (a.length >= 3) t = multiply(multiply([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case "matrix":
        if (a.length >= 6) t = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
    }
    m = multiply(m, t);
  }
  return m;
}

function multiply(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function applyMatrix(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
