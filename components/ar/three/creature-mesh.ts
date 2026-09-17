import * as THREE from "three";
import type { EquippedAccessory } from "@/components/creatures/creature";
import { LAYOUTS, shade, stageScales, type Layout } from "@/components/creatures/layout";
import type { EarType, ExtraType, MarkingType, MouthType, SignatureType, Species, SpeciesPalette, TailType } from "@/lib/creatures/types";
import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { parsePixelArt } from "@/lib/creatures/pixel";
import { createAccessoryAttacher } from "./accessory-attach";
import { buildPixelMesh } from "./pixel-mesh";
import { extrudeGeometry, pointsFromPath, shapesFromPath } from "./svg-shape";
import type { SolidResult } from "./svg-solid";
import { UNIT } from "./units";

export { CREATURE_HEIGHT_UNITS } from "./units";

export type TextureSource = (accessoryId: string, layer: "front" | "back") => Promise<THREE.Texture | null>;
/** The stand-alone SVG of an accessory layer (`accessoryMarkup()`), turned into a real volume; null when unavailable. */
export type MarkupSource = (accessoryId: string, layer: "front" | "back") => string | null;

export type CreatureMeshInput = {
  species: Species;
  stage: StageId;
  state: CreatureState;
  accessories: EquippedAccessory[];
  /** Accessory drawings rasterised: used for hats, and as the fallback of every other slot. */
  textures: TextureSource;
  /** Accessory drawings as markup: glasses, collars and body accessories become volumes laid on the creature. */
  markup?: MarkupSource;
};

/** Where the mouth is, in the creature's own frame (marker sides): height above the feet and distance ahead of the centre. */
export type MouthPosition = { height: number; front: number };

export type CreatureMesh = {
  /** Feet at the origin, standing along +y, facing +z. */
  root: THREE.Group;
  mouth: MouthPosition;
  animate(seconds: number): void;
  dispose(): void;
};

/** 2D drawing coordinates (viewBox 100×100, ground at y 92) → 3D (x right, y up), in viewBox units. */
const X = (v: number) => v - 50;
const Y = (v: number) => 92 - v;

const BRASS = "#E8C36A";
const BRASS_DARK = "#A6823A";
const CREAM = "#F7F4EC";
/** The 2D sparkle star (eyes, extras). */
const STAR = "M0 -3.2 L0.8 -0.8 L3.2 0 L0.8 0.8 L0 3.2 L-0.8 0.8 L-3.2 0 L-0.8 -0.8 Z";
const DEG = Math.PI / 180;

/** A flat part cut from one of the 2D drawings' paths: extruded into a thin slab. */
type FlatPart = { d: string; color: string; opacity?: number; depth?: number; scale?: number; extra?: Partial<THREE.MeshStandardMaterialParameters> };

/** What the 3D creature moves besides its breathing: wings that flap, flames that flicker. */
type Movers = { flappers: Array<{ group: THREE.Group; side: number }>; flickers: THREE.Group[] };

/**
 * Builds a creature in 3D from the same parts as the 2D drawing (spec § 3.19,
 * level 3): spheres and ellipsoids for the body and head, the very paths of
 * the 2D drawings extruded into thin slabs for the ears, wings, gems, flames
 * and the Sage's signature item, small spheres for the eyes, tubes for the
 * mouth and the markings, the palette's colours, and the accessories' own
 * drawings as volumes laid on the creature (glasses with temples, collars and
 * body accessories draped on the surface; hats as drawings facing the camera).
 * Nothing is modelled by hand: every species and every accessory works.
 */
export function buildCreatureMesh(input: CreatureMeshInput): CreatureMesh {
  const { species, stage, state, accessories } = input;
  if (species.pixel) return buildPixelMesh(input, parsePixelArt(species.pixel));
  const layout = LAYOUTS[species.parts.body];
  const scales = stageScales(stage, layout.hasDistinctHead);
  const palette = tintPalette(species.palette, state);
  const disposables: { dispose(): void }[] = [];
  let disposed = false;

  const material = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.78, metalness: 0, ...extra });
    disposables.push(m);
    return m;
  };
  const geometry = <G extends THREE.BufferGeometry>(g: G) => {
    disposables.push(g);
    return g;
  };
  const sphere = (color: string, rx: number, ry = rx, rz = rx, extra?: Partial<THREE.MeshStandardMaterialParameters>) => {
    const mesh = new THREE.Mesh(geometry(new THREE.SphereGeometry(1, 28, 20)), material(color, extra));
    mesh.scale.set(rx, ry, rz);
    return mesh;
  };
  const cone = (color: string, radius: number, height: number, extra?: Partial<THREE.MeshStandardMaterialParameters>) => {
    const mesh = new THREE.Mesh(geometry(new THREE.ConeGeometry(radius, height, 20)), material(color, extra));
    mesh.position.y = height / 2;
    return mesh;
  };
  const tube = (color: string, points: [number, number, number][], radius: number, extra?: Partial<THREE.MeshStandardMaterialParameters>) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return new THREE.Mesh(geometry(new THREE.TubeGeometry(curve, 24, radius, 10, false)), material(color, extra));
  };
  /** Thin slabs with the silhouettes of 2D paths, later parts a touch in front of the earlier ones. */
  const flat = (parts: FlatPart[], depth = 2.5) => {
    const g = new THREE.Group();
    let front = 0;
    parts.forEach((part, i) => {
      const shapes = shapesFromPath(part.d, { scale: part.scale });
      const params: Partial<THREE.MeshStandardMaterialParameters> = { ...(part.extra ?? {}) };
      if (part.opacity !== undefined && part.opacity < 1) Object.assign(params, { transparent: true, opacity: part.opacity, depthWrite: false });
      const d = part.depth ?? depth;
      const mesh = new THREE.Mesh(geometry(extrudeGeometry(shapes, { depth: d })), material(part.color, params));
      // Each later part (an inner pad, a tip) sits on the face of the previous one, a touch proud of it.
      mesh.position.z = i === 0 ? 0 : front - d / 2 + 0.3;
      front = mesh.position.z + d / 2;
      g.add(mesh);
    });
    return g;
  };
  const movers: Movers = { flappers: [], flickers: [] };

  const root = new THREE.Group();
  root.scale.setScalar(UNIT * scales.overall);

  // --- Body ---
  const body = new THREE.Group();
  body.scale.setScalar(scales.body);
  root.add(body);
  const { rx, ry } = layout.body;
  const rz = rx * 0.85;
  const bodyCentre = new THREE.Vector3(X(layout.body.cx), Y(layout.body.cy), 0);
  const torso = sphere(palette.primary, rx, ry, rz);
  torso.position.copy(bodyCentre);
  body.add(torso);
  if (species.parts.body === "serpent") {
    const neck = tube(palette.primary, [[X(50), Y(72), 0], [X(56), Y(56), 0], [X(62), Y(42), 0]], 6);
    body.add(neck);
  }
  /** Front surface of the body ellipsoid at a point of the drawing (root coordinates), 0 outside it. */
  const bodySurface = (x: number, y: number) => {
    const wx = (x - bodyCentre.x) / rx;
    const wy = (y - bodyCentre.y) / ry;
    return rz * Math.sqrt(Math.max(0, 1 - wx * wx - wy * wy));
  };
  // Markings, like the 2D drawing: none on babies, faint on children.
  const markingOpacity = stage === "bebe" ? 0 : stage === "enfant" ? 0.6 : 1;
  if (markingOpacity > 0) buildBodyMarkings(species.parts.markings, layout, palette, markingOpacity, { sphere, tube, geometry, material }, body, bodySurface);
  if (species.parts.markings === "shell") buildShell(layout, palette, Math.max(0.6, markingOpacity), { sphere, geometry, material }, body, rz);

  // --- Head (a separate sphere, or the upper part of the blob) ---
  const head = new THREE.Group();
  const headCentre = new THREE.Vector3(X(layout.head.cx), Y(layout.head.cy), 0);
  head.position.copy(headCentre);
  const r = layout.head.r;
  let surfaceZ: (x: number, y: number) => number;
  if (layout.hasDistinctHead) {
    head.scale.setScalar(scales.head);
    root.add(head);
    head.add(sphere(palette.primary, r));
    surfaceZ = (x, y) => Math.sqrt(Math.max(0, r * r - x * x - y * y));
  } else {
    body.add(head);
    surfaceZ = (x, y) => bodySurface(headCentre.x + x, headCentre.y + y);
  }
  /** Front-most surface of the whole silhouette at a point of the drawing (root coordinates). */
  const frontZ = (x: number, y: number) => {
    const headZ = layout.hasDistinctHead ? surfaceZ(x - headCentre.x, y - headCentre.y) * scales.head : 0;
    return Math.max(bodySurface(x, y) * scales.body, headZ, species.parts.body === "serpent" ? 6 : 0);
  };
  if (species.parts.markings === "spikes") buildSpikes(layout, palette, Math.max(0.7, markingOpacity), { cone }, head);
  if (markingOpacity > 0) buildHeadMarkings(species.parts.markings, layout, palette, markingOpacity, { sphere, tube, geometry, material }, head, surfaceZ);

  // --- Face ---
  const face = new THREE.Group();
  face.scale.setScalar(layout.hasDistinctHead ? 1 : scales.face);
  head.add(face);
  const eyeY = layout.head.cy - layout.eyeY;
  const eyes: THREE.Object3D[] = [];
  const eyeType = species.parts.eyes;
  for (const side of [-1, 1]) {
    const x = side * layout.eyeGap;
    const eye = new THREE.Group();
    const er = 3.3 * layout.eyeScale * (eyeType === "big" ? 1.15 : 1);
    eye.position.set(x, eyeY, surfaceZ(x, eyeY) - er * 0.4);
    const white = sphere("#ffffff", er, er * (eyeType === "sleepy" ? 0.6 : eyeType === "sharp" ? 0.78 : 1), er * 0.8, { roughness: 0.4 });
    eye.add(white);
    const iris = sphere(palette.eye, er * 0.55, er * 0.55 * (eyeType === "sleepy" ? 0.6 : 1), er * 0.3, { roughness: 0.35 });
    iris.position.set(0, -er * 0.05, er * 0.68);
    eye.add(iris);
    const glint = sphere("#ffffff", er * 0.2, er * 0.2, er * 0.12, { roughness: 0.2 });
    glint.position.set(er * 0.2, er * 0.28, er * 0.95);
    eye.add(glint);
    if (eyeType === "sparkle") {
      // The 2D star-shaped glint, cut from the same path.
      const star = new THREE.Mesh(geometry(extrudeGeometry(shapesFromPath(STAR, { scale: (0.55 * er) / 4.6 }), { depth: 0.3, bevel: 0 })), material("#ffffff", { roughness: 0.2 }));
      star.position.set(-er * 0.22, er * 0.26, er * 0.95);
      eye.add(star);
      const glint2 = sphere("#ffffff", er * 0.14, er * 0.14, er * 0.1, { roughness: 0.2 });
      glint2.position.set(er * 0.35, -er * 0.41, er * 0.9);
      eye.add(glint2);
    }
    if (state === "dead") eye.scale.y = 0.15;
    face.add(eye);
    eyes.push(eye);
  }
  const mouthY = layout.head.cy - layout.mouthY;
  const mouthZ = surfaceZ(0, mouthY);
  if (species.parts.markings === "mask" && markingOpacity > 0) {
    // Light muzzle patch under the mouth, like the 2D drawing.
    const muzzle = sphere(palette.secondary, 8.5, 5.6, 2.2, { transparent: true, opacity: 0.95 * markingOpacity });
    muzzle.position.set(0, mouthY + 0.5, surfaceZ(0, mouthY + 0.5) - 1.6);
    face.add(muzzle);
  }
  const mouth = buildMouth(species.parts.mouth, state, palette, { sphere, cone, tube }, (x, y) => surfaceZ(x, mouthY + y) - mouthZ + 0.6);
  mouth.position.set(0, mouthY, mouthZ);
  face.add(mouth);
  if (state !== "dead" && state !== "sick") {
    for (const side of [-1, 1]) {
      const x = side * layout.cheekGap;
      const cy = layout.head.cy - layout.cheekY;
      const cheek = sphere(palette.accent, 3.6, 2.1, 1.4, { transparent: true, opacity: 0.55 });
      cheek.position.set(x, cy, surfaceZ(x, cy) - 0.5);
      face.add(cheek);
    }
  }

  // --- Ears (on the head group, whose origin is the head centre in every silhouette) ---
  buildEars(species.parts.ears, layout, palette, { sphere, cone, flat, geometry, material }, (mesh, lx, ly) => {
    mesh.position.set(lx, ly, 0);
    head.add(mesh);
  });

  // --- Tail (behind the body) ---
  const tailGroup = new THREE.Group();
  tailGroup.position.set(X(layout.tail[0]), Y(layout.tail[1]), -rz * 0.5);
  const tailSide = layout.tail[0] >= 50 ? 1 : -1;
  buildTail(species.parts.tail, tailSide, palette, { sphere, tube }, tailGroup);
  body.add(tailGroup);

  const worn = Object.fromEntries(accessories.map((a) => [a.slot, a.id])) as Partial<Record<EquippedAccessory["slot"], string>>;
  const crowned = stage === "sage" && species.signature === "crown" && !worn.head && !worn.eyes;

  // --- Extras of the rare ones ---
  const extras = species.parts.extra === null ? [] : Array.isArray(species.parts.extra) ? species.parts.extra : [species.parts.extra];
  for (const extra of extras) buildExtra(extra, layout, palette, { sphere, cone, flat, tube, material, geometry }, { head, body, headR: r, rx, ry, rz, bodyCentre, movers, haloLift: crowned ? 5 : 0 });

  // --- The Sage's signature item, like in 2D: unless an accessory takes its place ---
  if (stage === "sage") {
    const eyeFront = surfaceZ(layout.eyeGap, eyeY) + 3.3 * layout.eyeScale * 0.5;
    buildSignature(species.signature, layout, palette, { sphere, cone, flat, tube, geometry, material }, {
      head,
      body,
      face,
      headFree: !worn.head && !worn.eyes,
      neckFree: !worn.neck && !worn.body,
      surfaceZ,
      frontZ: (x: number, y: number) => frontZ(x, y) / scales.body,
      eyeY,
      eyeFront,
    });
  }
  // --- Accessories: their own drawings as volumes laid on the creature (or as textured cards without the markup) ---
  const { attach, solid } = createAccessoryAttacher(input, disposables, () => disposed);
  const neckX = X(layout.neck[0]);
  const neckY = Y(layout.neck[1]);
  // Hats: the drawing facing the camera (a hat looks alike from every side, so a billboard is its best cheap volume).
  attach(worn.head, "front", head, new THREE.Vector3(0, layout.head.cy - layout.top, 0), "sprite");
  // Glasses and masks: a real pair in the face's plane, slightly bent along the head, with temples back to the ears.
  const eyeZ = surfaceZ(0, eyeY) + 2;
  const bentOnFace = (x: number, y: number) => 0.4 * (surfaceZ(x, eyeY + y) - surfaceZ(0, eyeY));
  const glasses = solid(worn.eyes, "front", face, new THREE.Vector3(0, eyeY, eyeZ), bentOnFace);
  if (glasses) buildTemples(glasses, { face, tube, surfaceZ, eyeY, eyeZ, bent: bentOnFace });
  else attach(worn.eyes, "front", face, new THREE.Vector3(0, eyeY, surfaceZ(0, eyeY) + 1.5), "sprite");
  // Collars and scarves: draped on the front of the body (and of the head above the neck), in the body's frame.
  const neckZ = frontZ(neckX, neckY) / scales.body;
  const onFront = (x: number, y: number) => frontZ(neckX + x, neckY + y) / scales.body - neckZ;
  if (!solid(worn.neck, "front", body, new THREE.Vector3(neckX, neckY, neckZ + 1.2), onFront)) {
    attach(worn.neck, "front", body, new THREE.Vector3(neckX, neckY, neckZ + 1.5), "sprite");
  }
  // Body accessories: draped on the belly (front layer) and on the back (back layer, later elements further behind).
  const onBelly = (x: number, y: number) => bodySurface(bodyCentre.x + x, bodyCentre.y + y) - rz;
  if (!solid(worn.body, "front", body, new THREE.Vector3(bodyCentre.x, bodyCentre.y, rz + 1), onBelly)) {
    attach(worn.body, "front", body, new THREE.Vector3(bodyCentre.x, bodyCentre.y, rz + 2), "card");
  }
  if (!solid(worn.body, "back", body, new THREE.Vector3(bodyCentre.x, bodyCentre.y, -rz - 1), (x, y) => -onBelly(x, y), -1)) {
    attach(worn.body, "back", body, new THREE.Vector3(bodyCentre.x, bodyCentre.y, -rz - 2), "card");
  }

  const baseScaleY = root.scale.y;
  const blinkPeriod = 3.2 + (hashOf(species.id) % 20) / 10;
  // The mouth's place in the creature's frame (the tongue of "Défendre" leaves from there).
  root.updateMatrixWorld(true);
  const mouthWorld = mouth.getWorldPosition(new THREE.Vector3());
  return {
    root,
    mouth: { height: mouthWorld.y, front: mouthWorld.z },
    animate(seconds) {
      if (state === "dead") return;
      root.scale.y = baseScaleY * (1 + 0.015 * Math.sin(seconds * 2.2));
      const phase = seconds % blinkPeriod;
      const blink = state !== "sick" && phase < 0.14 ? 0.12 : 1;
      for (const eye of eyes) eye.scale.y = blink;
      tailGroup.rotation.y = 0.12 * Math.sin(seconds * 2.6);
      // Wings flap like the 2D `mm-flap` (0 → 9°, 1.6 s), flames flicker like `mm-flicker`.
      const flap = 9 * DEG * (0.5 - 0.5 * Math.cos((seconds * Math.PI * 2) / 1.6));
      for (const { group, side } of movers.flappers) group.rotation.z = side * flap;
      const flicker = 0.5 + 0.5 * Math.sin((seconds * Math.PI * 2) / 0.9);
      for (const flame of movers.flickers) flame.scale.set(1 + 0.12 * flicker, 1 - 0.12 * flicker, 1);
    },
    dispose() {
      disposed = true;
      for (const d of disposables) d.dispose();
    },
  };
}

type Builders = {
  sphere: (color: string, rx: number, ry?: number, rz?: number, extra?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.Mesh;
  cone: (color: string, radius: number, height: number, extra?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.Mesh;
  tube?: (color: string, points: [number, number, number][], radius: number, extra?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.Mesh;
  flat?: (parts: FlatPart[], depth?: number) => THREE.Group;
  material?: (color: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial;
  geometry?: <G extends THREE.BufferGeometry>(g: G) => G;
};

/** A translucent material for markings and pads. */
const alpha = (opacity: number): Partial<THREE.MeshStandardMaterialParameters> => (opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {});

/**
 * The temples of a pair of glasses (or the strap of a mask): from each outer
 * edge of the drawing straight back, then along the head to behind the ears,
 * in the frame's colour. Only for drawings spanning both sides of the face
 * (a monocle has none).
 */
function buildTemples(
  glasses: SolidResult,
  ctx: { face: THREE.Object3D; tube: NonNullable<Builders["tube"]>; surfaceZ: (x: number, y: number) => number; eyeY: number; eyeZ: number; bent: (x: number, y: number) => number },
) {
  const { leftmost, rightmost, bounds } = glasses;
  if (!leftmost || !rightmost || !bounds || bounds.minX > -4 || bounds.maxX < 4) return;
  for (const side of [-1, 1] as const) {
    const edge = side > 0 ? rightmost : leftmost;
    const y = ctx.eyeY + edge.y;
    const startX = Math.abs(edge.x);
    const startZ = ctx.eyeZ + ctx.bent(edge.x, edge.y);
    // Where the head ends at that height.
    let half = startX;
    while (half < 80 && ctx.surfaceZ(side * half, y) > 0.05) half += 0.5;
    const points: [number, number, number][] = [];
    const n = 8;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = startX + (half - startX) * t;
      const hug = ctx.surfaceZ(side * x, y) + 0.9;
      // Straight back from the hinge, then hugging the head.
      points.push([side * x, y, Math.max(hug, startZ * (1 - t * 1.6))]);
    }
    points.push([side * (half + 0.2), y - 0.6, -2.5], [side * (half - 0.6), y - 2.2, -5.5]);
    ctx.face.add(ctx.tube(glasses.frameColor, points, 0.6, { roughness: 0.5 }));
  }
}

function buildMouth(
  type: MouthType,
  state: CreatureState,
  palette: SpeciesPalette,
  b: Required<Pick<Builders, "sphere" | "cone" | "tube">>,
  /** Depth of the surface under a point of the mouth (relative to the mouth's origin), so lines hug the face. */
  depth: (x: number, y: number) => number,
): THREE.Group {
  const g = new THREE.Group();
  const line = (points: [number, number, number][], color = palette.eye, radius = 0.7) =>
    g.add(b.tube(color, points.map(([x, y, z]): [number, number, number] => [x, y, z + depth(x, y)]), radius));
  if (state === "sick") {
    line([[-4.5, -1, 0], [-2.2, 1.2, 0], [0, -1, 0], [2.2, -3, 0], [4.5, -1, 0]]);
  } else if (state === "tired") {
    line([[-3.2, 0, 0], [0, 0.1, 0], [3.2, 0, 0]]);
  } else if (state === "dead") {
    line([[-2.5, 0, 0], [0, -1.5, 0], [2.5, 0, 0]]);
  } else {
    switch (type) {
      case "small":
        line([[-1.8, 0, 0], [0, -1.6, 0], [1.8, 0, 0]]);
        break;
      case "beak": {
        const beak = b.cone(palette.accent, 4.5, 7);
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, 0, 3.5);
        beak.scale.y = 0.75;
        g.add(beak);
        break;
      }
      case "snout": {
        g.add(b.sphere(palette.secondary, 5.6, 3.9, 2.4));
        for (const side of [-1, 1]) {
          const nostril = b.sphere(palette.eye, 0.9, 0.9, 0.5);
          nostril.position.set(side * 1.9, 0.1, 2.3);
          g.add(nostril);
        }
        break;
      }
      case "tongue": {
        line([[-4.5, 0.8, 0], [0, -3.2, 0], [4.5, 0.8, 0]]);
        const tongue = b.sphere("#E88A9A", 2.1, 1.9, 1.2);
        tongue.position.set(0.6, -2.6, 0.6);
        g.add(tongue);
        break;
      }
      case "fangs": {
        line([[-4.2, 0.5, 0], [0, -3, 0], [4.2, 0.5, 0]]);
        for (const side of [-1, 1]) {
          const fang = b.cone("#ffffff", 0.7, 2.4);
          fang.rotation.x = Math.PI;
          fang.position.set(side * 2.2, -1.4, 0.9);
          g.add(fang);
        }
        break;
      }
      case "w":
        line([[-4.5, 0, 0], [-2.2, -2.2, 0], [0, 0, 0], [2.2, -2.2, 0], [4.5, 0, 0]]);
        break;
      default:
        line([[-4.2, 0.5, 0], [0, -3.4, 0], [4.2, 0.5, 0]]);
    }
  }
  return g;
}

/** The ears of the 2D drawings (`parts/ears.tsx`), path for path, in ear coordinates (y down, the anchor at the origin). */
const EAR_PATHS: Partial<Record<EarType, (palette: SpeciesPalette) => FlatPart[]>> = {
  cat: (p) => [
    { d: "M0 3 L-6 -14 L10 -4 Z", color: p.primary },
    { d: "M0.5 0.5 L-3 -8.5 L6 -3 Z", color: p.accent, opacity: 0.75, depth: 2 },
  ],
  fox: (p) => [
    { d: "M0 4 L-8 -19 L12 -5 Z", color: p.primary },
    { d: "M-5.5 -11 L-8 -19 L0 -14 Z", color: p.secondary, depth: 2 },
    { d: "M0.5 1 L-4 -10 L7 -3 Z", color: p.accent, opacity: 0.75, depth: 2 },
  ],
  horns: (p) => [{ d: "M0 3 C-2 -5 4 -13 11 -15 C6 -9 5 -3 4 4 Z", color: p.secondary, depth: 3.5 }],
  fold: (p) => [
    { d: "M-2 -2 C2 -11 15 -9 13 6 C12 14 2 15 -1 7 Z", color: p.secondary },
    { d: "M1 0 C4 -6 11 -5 10 5 C9 10 3 11 1 5 Z", color: p.accent, opacity: 0.75, depth: 2 },
  ],
  pig: (p) => [
    { d: "M0 3 L-4 -10 L10 -3 Z", color: p.primary },
    { d: "M0.5 1 L-2 -6 L6 -2 Z", color: p.secondary, opacity: 0.7, depth: 2 },
  ],
  horn: (p) => [
    { d: "M0 3 L-4 -9 L7 -3 Z", color: p.primary },
    { d: "M0.5 1 L-2 -5.5 L4 -2 Z", color: p.accent, opacity: 0.75, depth: 2 },
  ],
};

/**
 * Ears, with the 2D silhouettes: the pointed ones are the drawings' own
 * triangles and curves extruded (leaning exactly as drawn, the left one
 * mirrored), the round and rabbit ones are ellipsoids, the antlers branches.
 */
function buildEars(
  type: EarType,
  layout: Layout,
  palette: SpeciesPalette,
  b: Required<Pick<Builders, "sphere" | "cone" | "flat" | "geometry" | "material">>,
  place: (mesh: THREE.Object3D, lx: number, ly: number) => void,
) {
  if (type === "none") return;
  const inner = alpha(0.75);
  if (type === "horn") {
    // The single horn on the forehead, with its small ridges.
    const horn = new THREE.Group();
    horn.add(b.cone(palette.accent, 3.2, 17));
    for (const [y, w] of [
      [4, 2],
      [8, 1.5],
    ] as const) {
      const ridge = new THREE.Mesh(b.geometry(new THREE.TorusGeometry(3.2 - y * 0.16, 0.35, 6, 20)), b.material(shade(palette.accent, -0.3)));
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = y;
      ridge.scale.setScalar(1.02 - w * 0.02);
      horn.add(ridge);
    }
    place(horn, 0, layout.head.cy - (layout.top + 2));
  }
  for (const [point, side] of [
    [layout.ears.left, -1],
    [layout.ears.right, 1],
  ] as const) {
    const ear = new THREE.Group();
    // The drawing's own rotation (the rabbit's 14°) and the silhouette's tilt, mirrored for the left ear (SVG turns clockwise, Three.js the other way).
    let svgDeg = -layout.ears.tilt;
    switch (type) {
      case "rabbit": {
        svgDeg += 14;
        const long = b.sphere(palette.primary, 4.6, 13.5, 3.2);
        long.position.y = 10;
        ear.add(long);
        const pad = b.sphere(palette.accent, 2.3, 9.5, 1.6, inner);
        pad.position.set(0, 9, 2.6);
        ear.add(pad);
        break;
      }
      case "round": {
        const ball = b.sphere(palette.primary, 6.5);
        ball.position.y = 2;
        ear.add(ball);
        const pad = b.sphere(palette.accent, 3.3, 3.3, 1.6, inner);
        pad.position.set(0, 1.5, 5.6);
        ear.add(pad);
        break;
      }
      case "antlers": {
        const wood = b.material(palette.secondary, { roughness: 0.8 });
        const branch = (from: [number, number], to: [number, number], radius: number) => {
          const dx = to[0] - from[0];
          const dy = to[1] - from[1];
          const length = Math.hypot(dx, dy);
          const mesh = new THREE.Mesh(b.geometry(new THREE.CylinderGeometry(radius, radius * 1.15, length, 10)), wood);
          mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0);
          mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
          ear.add(mesh);
          const knot = b.sphere(palette.secondary, radius * 1.05);
          knot.position.set(to[0], to[1], 0);
          ear.add(knot);
        };
        // The 2D strokes, y flipped: trunk, fork, twig.
        branch([0, -3], [2, 8], 1.3);
        branch([2, 8], [-3, 15], 1.1);
        branch([2, 8], [6, 17], 1.1);
        branch([1, 3], [7, 6], 0.9);
        ear.scale.x = side;
        break;
      }
      default: {
        const parts = EAR_PATHS[type];
        if (!parts) break;
        ear.add(b.flat(parts(palette), 4));
        ear.scale.x = side;
      }
    }
    ear.rotation.z = -side * svgDeg * DEG;
    place(ear, point[0] - layout.head.cx, layout.head.cy - point[1]);
  }
}

/** Body markings like the 2D drawing: a belly patch and spots as flat bumps, stripes as strokes hugging the surface, scales as small arcs. */
function buildBodyMarkings(
  type: MarkingType,
  layout: Layout,
  palette: SpeciesPalette,
  opacity: number,
  b: Required<Pick<Builders, "sphere" | "tube" | "geometry" | "material">>,
  body: THREE.Group,
  surface: (x: number, y: number) => number,
) {
  const { cx, cy, rx, ry } = layout.body;
  const bump = (color: string, x: number, y: number, w: number, h: number, a: number) => {
    const m = b.sphere(color, w, h, 1.6, alpha(a * opacity));
    m.position.set(X(x), Y(y), surface(X(x), Y(y)) - 0.7);
    body.add(m);
  };
  /** A 2D stroke (absolute or relative path) laid on the body's surface. */
  const stroke = (d: string, color: string, a: number, radius: number) => {
    const points = pointsFromPath(d, 8).map(([x, y]) => [x - 50, y + 92] as const);
    body.add(b.tube(color, points.map(([x, y]): [number, number, number] => [x, y, surface(x, y) + 0.3]), radius, alpha(a * opacity)));
  };
  switch (type) {
    case "belly_patch":
      bump(palette.accent, cx, cy + ry * 0.2, rx * 0.55, ry * 0.5, 0.55);
      return;
    case "spots":
      bump(palette.secondary, cx - 9, cy - 4, 3.2, 3.2, 0.55);
      bump(palette.secondary, cx + 10, cy + 2, 2.6, 2.6, 0.55);
      bump(palette.secondary, cx - 2, cy + 9, 2.1, 2.1, 0.55);
      bump(palette.secondary, cx + 4, cy - 10, 1.9, 1.9, 0.55);
      return;
    case "stripes":
      stroke(`M${cx - rx + 3} ${cy - 6} q4 3 3 8`, palette.secondary, 0.8, 1.2);
      stroke(`M${cx + rx - 3} ${cy - 6} q-4 3 -3 8`, palette.secondary, 0.8, 1.2);
      return;
    case "scales": {
      const material = b.material(palette.secondary, alpha(0.55 * opacity));
      const arc = b.geometry(new THREE.TorusGeometry(2.6, 0.55, 6, 12, Math.PI));
      for (const row of [-1, 0, 1]) {
        for (const col of [-2, -1, 0, 1, 2]) {
          const x = X(cx + col * 6 + (row % 2 === 0 ? 0 : 3));
          const y = Y(cy + row * 6);
          const scale = new THREE.Mesh(arc, material);
          scale.rotation.z = Math.PI;
          scale.position.set(x, y, surface(x, y) - 0.1);
          body.add(scale);
        }
      }
      return;
    }
    default:
      return;
  }
}

/** Head markings like `HeadMarkings` in 2D: forehead stripes, the blaze of a mask, the badger's bands, the crescent. */
function buildHeadMarkings(
  type: MarkingType,
  layout: Layout,
  palette: SpeciesPalette,
  opacity: number,
  b: Required<Pick<Builders, "sphere" | "tube" | "geometry" | "material">>,
  head: THREE.Group,
  surfaceZ: (x: number, y: number) => number,
) {
  const { r, cx, cy } = layout.head;
  const L = (x: number, y: number): [number, number] => [x - cx, cy - y];
  switch (type) {
    case "stripes":
      for (const [x0, y0, x1, y1] of [
        [cx - 6, cy - r + 5, cx - 4.5, cy - r + 11],
        [cx, cy - r + 3, cx, cy - r + 9.5],
        [cx + 6, cy - r + 5, cx + 4.5, cy - r + 11],
      ]) {
        const a = L(x0, y0);
        const m = L((x0 + x1) / 2, (y0 + y1) / 2);
        const z = L(x1, y1);
        head.add(b.tube(palette.secondary, [[a[0], a[1], surfaceZ(a[0], a[1]) + 0.4], [m[0], m[1], surfaceZ(m[0], m[1]) + 0.4], [z[0], z[1], surfaceZ(z[0], z[1]) + 0.4]], 1.2, alpha(0.8 * opacity)));
      }
      return;
    case "mask": {
      const blaze = b.sphere(palette.secondary, 3, r * 0.45, 1.6, alpha(0.9 * opacity));
      blaze.position.set(0, r * 0.25, surfaceZ(0, r * 0.25) - 0.9);
      head.add(blaze);
      return;
    }
    case "badger":
      for (const side of [-1, 1]) {
        const x = layout.faceX - cx + side * layout.eyeGap;
        const band = b.sphere(palette.secondary, 4, r * 0.75, 1.3, alpha(0.85 * opacity));
        band.position.set(x, r * 0.1, surfaceZ(x, r * 0.1) - 1);
        head.add(band);
      }
      return;
    case "crescent": {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 4, Math.PI / 2, (3 * Math.PI) / 2, false);
      shape.absarc(0, 0, 3, (3 * Math.PI) / 2, Math.PI / 2, true);
      shape.closePath();
      const moon = new THREE.Mesh(b.geometry(extrudeGeometry([shape], { depth: 1, bevel: 0.2 })), b.material(palette.accent, { ...alpha(opacity), emissive: new THREE.Color(palette.accent), emissiveIntensity: 0.25 }));
      moon.position.set(1, r * 0.58, surfaceZ(1, r * 0.58) - 0.2);
      head.add(moon);
      return;
    }
    default:
      return;
  }
}

/** The shell behind the body (a thick disc with three hexagonal rings on its back), like `BackMarkings` in 2D. */
function buildShell(layout: Layout, palette: SpeciesPalette, opacity: number, b: Required<Pick<Builders, "sphere" | "geometry" | "material">>, body: THREE.Group, rz: number) {
  const { cx } = layout.body;
  const cy = layout.body.cy - 8;
  const r = layout.body.rx + 3;
  const z = -rz * 0.7;
  const disc = b.sphere(palette.secondary, r, r, 5, alpha(opacity));
  disc.position.set(X(cx), Y(cy), z);
  body.add(disc);
  const ring = b.geometry(new THREE.TorusGeometry(1, 0.11, 6, 6));
  const material = b.material(palette.accent, alpha(0.7 * opacity));
  for (const [dx, dy, size] of [
    [0, -r * 0.45, 6],
    [-r * 0.55, r * 0.1, 5],
    [r * 0.55, r * 0.1, 5],
  ]) {
    const hex = new THREE.Mesh(ring, material);
    hex.scale.setScalar(size);
    hex.rotation.z = Math.PI / 6;
    hex.position.set(X(cx + dx), Y(cy + dy), z - 5);
    body.add(hex);
  }
}

/** The crest of spikes around the top of the head, like `BackMarkings` in 2D. */
function buildSpikes(layout: Layout, palette: SpeciesPalette, opacity: number, b: Pick<Builders, "cone">, head: THREE.Group) {
  const r = layout.head.r;
  for (let i = 0; i < 7; i += 1) {
    const angle = Math.PI + (Math.PI * (2 * i + 1)) / 14;
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle);
    const spike = new THREE.Group();
    spike.add(b.cone(palette.secondary, 2.4, 9, alpha(opacity)));
    spike.position.set(dx * (r - 2), dy * (r - 2), -3);
    spike.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    head.add(spike);
  }
}

function buildTail(type: TailType, s: number, palette: SpeciesPalette, b: Required<Pick<Builders, "sphere" | "tube">>, group: THREE.Group) {
  switch (type) {
    case "none":
      return;
    case "curl": {
      group.add(b.tube(palette.primary, [[0, 0, 0], [s * 9, 2, -1], [s * 16, 10, -2], [s * 11, 20, -2], [s * 3, 15, -1]], 2.6));
      const tip = b.sphere(palette.secondary, 2.9);
      tip.position.set(s * 3, 15, -1);
      group.add(tip);
      return;
    }
    case "fluffy": {
      const puff = b.sphere(palette.primary, 7, 12.5, 6);
      puff.position.set(s * 7, 9, -1);
      puff.rotation.z = -s * 0.66;
      group.add(puff);
      const tip = b.sphere(palette.accent, 3.6, 5.5, 3);
      tip.position.set(s * 10.5, 16, 0);
      tip.rotation.z = -s * 0.66;
      group.add(tip);
      return;
    }
    case "thin":
      group.add(b.tube(palette.secondary, [[0, 0, 0], [s * 6, 3, 0], [s * 7, 9, 0], [s * 2, 9, 0]], 1));
      return;
    case "feather": {
      const plume = b.sphere(palette.accent, 6, 14, 1.6);
      plume.position.set(s * 6, 10, -1);
      plume.rotation.z = -s * 0.5;
      group.add(plume);
      return;
    }
    case "stub": {
      const stub = b.sphere(palette.primary, 4);
      stub.position.set(s * 2, 2, 0);
      group.add(stub);
      return;
    }
    case "puff": {
      const puff = b.sphere(palette.accent, 5);
      puff.position.set(s * 3, 3, 0);
      group.add(puff);
      return;
    }
  }
}

const WING = "M0 0 C14 -20 36 -18 34 -4 C30 4 18 6 2 6 Z";
const WING_VEINS = ["M4 3 C14 -8 26 -10 31 -5", "M6 5 C14 -2 24 -3 30 0"];
const GEM = "M0 -7 L4 -2 L2.5 5 L-2.5 5 L-4 -2 Z";
const FLAME = "M0 0 C-4.5 -6 -2.5 -12 0 -17 C2.5 -12 4.5 -6 0 0 Z";

/** The extras of the rare ones, with the 2D shapes: cream wings that flap, a halo, gems, a flaming tail, an aura. */
function buildExtra(
  type: ExtraType,
  layout: Layout,
  palette: SpeciesPalette,
  b: Required<Pick<Builders, "sphere" | "cone" | "flat" | "tube" | "material" | "geometry">>,
  ctx: { head: THREE.Group; body: THREE.Group; headR: number; rx: number; ry: number; rz: number; bodyCentre: THREE.Vector3; movers: Movers; haloLift: number },
) {
  switch (type) {
    case "halo": {
      const halo = new THREE.Mesh(b.geometry(new THREE.TorusGeometry(11, 1.2, 12, 40)), b.material(palette.accent, { emissive: new THREE.Color(palette.accent), emissiveIntensity: 0.6 }));
      halo.rotation.x = Math.PI / 2;
      // Above the head like in 2D, higher still over a crown.
      halo.position.y = layout.head.cy - layout.top + 6 + ctx.haloLift;
      ctx.head.add(halo);
      return;
    }
    case "wings":
      // Cream wings rooted at the neck, veined, behind the body; the left one is the mirror of the right one.
      for (const side of [1, -1]) {
        const wing = new THREE.Group();
        wing.add(b.flat([{ d: WING, color: CREAM, depth: 1.4 }]));
        for (const vein of WING_VEINS) {
          const points = pointsFromPath(vein, 8).map(([x, y]): [number, number, number] => [x, y, 0.95]);
          wing.add(b.tube(palette.secondary, points, 0.4, alpha(0.35)));
        }
        wing.position.set(side * 6, Y(layout.neck[1]), -ctx.rz * 0.55);
        wing.scale.x = side;
        ctx.body.add(wing);
        ctx.movers.flappers.push({ group: wing, side });
      }
      return;
    case "crystals": {
      const { cx, cy, rx, ry } = layout.body;
      for (const [x, y, svgDeg, scale] of [
        [cx - rx + 2, cy - 12, -25, 1],
        [cx + rx - 2, cy - 14, 25, 1.2],
        [cx, cy - ry - 2, 0, 0.9],
      ]) {
        const gem = b.flat([{ d: GEM, color: palette.accent, opacity: 0.9, depth: 2.2, extra: { emissive: new THREE.Color(palette.accent), emissiveIntensity: 0.3, roughness: 0.3 } }]);
        gem.position.set(X(x), Y(y), -ctx.rz * 0.45);
        gem.rotation.z = -svgDeg * DEG;
        gem.scale.setScalar(scale);
        ctx.body.add(gem);
      }
      return;
    }
    case "flames": {
      // A flaming tail, like in 2D.
      const [tx, ty] = layout.tail;
      const flame = new THREE.Group();
      flame.add(b.flat([{ d: FLAME, color: "#E8853A", depth: 2.4, extra: { emissive: new THREE.Color("#ff6a00"), emissiveIntensity: 0.5 } }]));
      const core = b.flat([{ d: FLAME, color: "#F0D68F", depth: 1.4, extra: { emissive: new THREE.Color("#F0D68F"), emissiveIntensity: 0.4 } }]);
      core.scale.setScalar(0.55);
      core.position.z = 1.2;
      flame.add(core);
      flame.position.set(X(tx + 8), Y(ty - 18), -ctx.rz * 0.45);
      ctx.body.add(flame);
      ctx.movers.flickers.push(flame);
      return;
    }
    case "aura": {
      const aura = b.sphere(palette.accent, Math.max(ctx.headR, ctx.rx) + 14, Math.max(ctx.headR, ctx.rx) + 22, Math.max(ctx.headR, ctx.rx) + 14, {
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      aura.position.set(ctx.bodyCentre.x, ctx.bodyCentre.y + 10, 0);
      ctx.body.add(aura);
      return;
    }
  }
}

/**
 * The Sage's signature item (`parts/signatures.tsx`): on the head unless a
 * head or eye accessory is worn, at the neck unless a neck or body one is.
 */
function buildSignature(
  type: SignatureType,
  layout: Layout,
  palette: SpeciesPalette,
  b: Required<Pick<Builders, "sphere" | "cone" | "flat" | "tube" | "geometry" | "material">>,
  ctx: {
    head: THREE.Group;
    body: THREE.Group;
    face: THREE.Group;
    headFree: boolean;
    neckFree: boolean;
    surfaceZ: (x: number, y: number) => number;
    /** Front of the silhouette at a point of the drawing (root coordinates), in the body group's scale. */
    frontZ: (x: number, y: number) => number;
    eyeY: number;
    eyeFront: number;
  },
) {
  const { head, top } = layout;
  const topY = head.cy - (top + 1);
  const [nx, ny] = layout.neck;
  const neckZ = ctx.frontZ(X(nx), Y(ny)) + 1.2;
  switch (type) {
    case "crown": {
      if (!ctx.headFree) return;
      const crown = new THREE.Group();
      const band = new THREE.Mesh(b.geometry(new THREE.CylinderGeometry(9, 9.4, 4, 28, 1, true)), b.material(BRASS, { side: THREE.DoubleSide, metalness: 0.25, roughness: 0.45 }));
      band.position.y = -1;
      crown.add(band);
      for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const point = new THREE.Group();
        point.add(b.cone(BRASS, 2.4, 7, { metalness: 0.25, roughness: 0.45 }));
        point.position.set(9 * Math.sin(angle), 1, 9 * Math.cos(angle));
        crown.add(point);
      }
      for (const [x, y, color] of [
        [-5, 0, "#D9666B"],
        [0, 1, "#7DA7D9"],
        [5, 0, "#7FB77E"],
      ] as const) {
        const gem = b.sphere(color, 1.2, 1.2, 0.8, { roughness: 0.3 });
        gem.position.set(x, y, Math.sqrt(81 - x * x) + 0.4);
        crown.add(gem);
      }
      crown.position.set(0, topY, 0);
      ctx.head.add(crown);
      return;
    }
    case "leaf": {
      if (!ctx.headFree) return;
      const leaf = new THREE.Group();
      leaf.add(b.flat([{ d: "M0 0 C-6 -2 -8 -10 -2 -14 C4 -11 4 -3 0 0 Z", color: "#7FB77E", depth: 1.2 }]));
      const vein = pointsFromPath("M-1 -1 C-3 -5 -3 -9 -2 -12", 6).map(([x, y]): [number, number, number] => [x, y, 0.8]);
      leaf.add(b.tube("#3F6B3E", vein, 0.35));
      leaf.position.set(4, topY, 0);
      leaf.rotation.x = -0.35;
      ctx.head.add(leaf);
      return;
    }
    case "flower": {
      if (!ctx.headFree) return;
      const x = -head.r * 0.72;
      const y = head.cy - (top + 7);
      const flower = new THREE.Group();
      for (let i = 0; i < 5; i += 1) {
        const a = (i * 72 + 90) * DEG;
        const petal = b.sphere(palette.accent, 2.3, 2.3, 1.2);
        petal.position.set(3.2 * Math.cos(a), 3.2 * Math.sin(a), 0);
        flower.add(petal);
      }
      const heart = b.sphere(BRASS, 1.8, 1.8, 1.2);
      heart.position.z = 0.7;
      flower.add(heart);
      flower.position.set(x, y, Math.max(0.5, ctx.surfaceZ(x, y)));
      ctx.head.add(flower);
      return;
    }
    case "monocle": {
      if (!ctx.headFree) return;
      const monocle = new THREE.Group();
      const rim = new THREE.Mesh(b.geometry(new THREE.TorusGeometry(6.4, 0.7, 10, 32)), b.material(BRASS, { metalness: 0.3, roughness: 0.4 }));
      monocle.add(rim);
      const chain = pointsFromPath("M5 4 q3 6 1 12", 8).map(([x, y]): [number, number, number] => [x, y, 0]);
      monocle.add(b.tube(BRASS, chain, 0.4));
      monocle.position.set(layout.faceX - head.cx + layout.eyeGap, ctx.eyeY, ctx.eyeFront + 0.8);
      ctx.face.add(monocle);
      return;
    }
    case "bow": {
      if (!ctx.neckFree) return;
      const bow = new THREE.Group();
      bow.add(b.flat([{ d: "M0 0 L-7.5 -4.5 L-7 4.5 Z M0 0 L7.5 -4.5 L7 4.5 Z", color: palette.accent, depth: 2.5 }]));
      const knot = b.sphere(palette.secondary, 2, 2, 1.5);
      knot.position.z = 1.4;
      bow.add(knot);
      bow.position.set(X(nx), Y(ny + 2), neckZ);
      ctx.body.add(bow);
      return;
    }
    case "scarf": {
      if (!ctx.neckFree) return;
      const scarf = b.flat([
        { d: "M-13 -2 Q0 5 13 -2 Q0 10 -13 -2 Z", color: palette.accent, depth: 2.2 },
        { d: "M5 4 L8.5 14 L3 12.5 Z", color: palette.accent, depth: 1.6 },
      ]);
      scarf.position.set(X(nx), Y(ny + 1), neckZ);
      ctx.body.add(scarf);
      return;
    }
    case "bell": {
      if (!ctx.neckFree) return;
      const bell = new THREE.Group();
      const ribbon = pointsFromPath("M-13 -4 Q0 2 13 -4", 10).map(([x, y]): [number, number, number] => [x, y, 0]);
      bell.add(b.tube("#D9666B", ribbon, 1));
      const dome = b.sphere(BRASS, 4.2, 3.6, 3.6, { metalness: 0.25, roughness: 0.45 });
      dome.position.set(0, -0.6, 0.6);
      bell.add(dome);
      const lip = new THREE.Mesh(b.geometry(new THREE.CylinderGeometry(4.2, 5.2, 2.4, 20)), b.material(BRASS, { metalness: 0.25, roughness: 0.45 }));
      lip.position.set(0, -3.8, 0.6);
      bell.add(lip);
      const clapper = b.sphere(BRASS_DARK, 1.1);
      clapper.position.set(0, -5.6, 1.4);
      bell.add(clapper);
      bell.position.set(X(nx), Y(ny + 3), neckZ);
      ctx.body.add(bell);
      return;
    }
    case "star_pin": {
      if (!ctx.neckFree) return;
      const pin = b.flat([{ d: "M0 -4.2 L1.1 -1.1 L4.2 0 L1.1 1.1 L0 4.2 L-1.1 1.1 L-4.2 0 L-1.1 -1.1 Z", color: BRASS, depth: 1.5, extra: { metalness: 0.3, roughness: 0.4 } }]);
      pin.position.set(X(nx - 8), Y(ny + 8), ctx.frontZ(X(nx - 8), Y(ny + 8)) + 1);
      ctx.body.add(pin);
      return;
    }
    case "pearl": {
      if (!ctx.neckFree) return;
      for (const x of [-12, -8, -4, 0, 4, 8, 12]) {
        const y = Math.abs(x) * -0.18 + 2.5;
        const pearl = b.sphere(CREAM, 1.7, 1.7, 1.7, { roughness: 0.25 });
        pearl.position.set(X(nx + x), Y(ny + 2 + y), ctx.frontZ(X(nx + x), Y(ny + 2 + y)) + 1);
        ctx.body.add(pearl);
      }
      return;
    }
    case "bandana": {
      if (!ctx.neckFree) return;
      const bandana = new THREE.Group();
      bandana.add(b.flat([{ d: "M-13 -1 Q0 5 13 -1 L1 13 Z", color: "#D9666B", depth: 1.6 }]));
      for (const [x, y] of [
        [-4, 4],
        [3, 6],
        [0, 1.5],
      ]) {
        const dot = b.sphere(CREAM, 0.9, 0.9, 0.5);
        dot.position.set(x, -y, 1);
        bandana.add(dot);
      }
      bandana.position.set(X(nx), Y(ny + 1), neckZ);
      ctx.body.add(bandana);
      return;
    }
  }
}

/** The state tints, like the 2D filters: sick goes greenish, tired dull, dead grey. */
function tintPalette(palette: SpeciesPalette, state: CreatureState): SpeciesPalette {
  const adjust = (hex: string) => {
    const c = new THREE.Color(hex);
    if (state === "sick") c.lerp(new THREE.Color("#7fb77e"), 0.28);
    if (state === "tired") {
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      c.setHSL(hsl.h, hsl.s * 0.6, hsl.l);
    }
    if (state === "dead") {
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      c.setHSL(hsl.h, hsl.s * 0.1, Math.min(0.9, hsl.l * 1.1));
    }
    return `#${c.getHexString()}`;
  };
  return { primary: adjust(palette.primary), secondary: adjust(palette.secondary), accent: adjust(palette.accent), eye: adjust(palette.eye) };
}

function hashOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
