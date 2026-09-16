import * as THREE from "three";
import type { EquippedAccessory } from "@/components/creatures/creature";
import { LAYOUTS, shade, stageScales, type Layout } from "@/components/creatures/layout";
import type { EarType, ExtraType, MarkingType, MouthType, Species, SpeciesPalette, TailType } from "@/lib/creatures/types";
import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";

/** Creature height in marker sides (the printed square is 1). */
export const CREATURE_HEIGHT_UNITS = 2.2;
/** One viewBox unit of the 2D drawings, in marker sides. */
const UNIT = CREATURE_HEIGHT_UNITS / 100;

export type TextureSource = (accessoryId: string, layer: "front" | "back") => Promise<THREE.Texture | null>;

export type CreatureMeshInput = {
  species: Species;
  stage: StageId;
  state: CreatureState;
  accessories: EquippedAccessory[];
  textures: TextureSource;
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

const ACCESSORY_PLANE = 72;

/**
 * Builds a creature in 3D from the same parts as the 2D drawing (spec § 3.19,
 * level 3): spheres and ellipsoids for the body and head, cones and
 * ellipsoids for ears and tails, small spheres for the eyes, tubes for the
 * mouth, the palette's colours, and the accessories' own drawings as
 * textured cards. Nothing is modelled by hand: every species works.
 */
export function buildCreatureMesh(input: CreatureMeshInput): CreatureMesh {
  const { species, stage, state, accessories, textures } = input;
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
  const tube = (color: string, points: [number, number, number][], radius: number) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return new THREE.Mesh(geometry(new THREE.TubeGeometry(curve, 24, radius, 10, false)), material(color));
  };

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
  if (markingOpacity > 0) buildBodyMarkings(species.parts.markings, layout, palette, markingOpacity, { sphere }, body, bodySurface);

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
      const glint2 = sphere("#ffffff", er * 0.12, er * 0.12, er * 0.1);
      glint2.position.set(-er * 0.25, -er * 0.2, er * 0.95);
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
  buildEars(species.parts.ears, layout, palette, { sphere, cone, geometry, material }, (mesh, lx, ly) => {
    mesh.position.set(lx, ly, 0);
    head.add(mesh);
  });

  // --- Tail (behind the body) ---
  const tailGroup = new THREE.Group();
  tailGroup.position.set(X(layout.tail[0]), Y(layout.tail[1]), -rz * 0.5);
  const tailSide = layout.tail[0] >= 50 ? 1 : -1;
  buildTail(species.parts.tail, tailSide, palette, { sphere, tube }, tailGroup);
  body.add(tailGroup);

  // --- Extras of the rare ones ---
  const extras = species.parts.extra === null ? [] : Array.isArray(species.parts.extra) ? species.parts.extra : [species.parts.extra];
  for (const extra of extras) buildExtra(extra, layout, palette, { sphere, cone, material, geometry }, { head, body, headR: r, rx, ry, rz, bodyCentre });

  // --- Accessories: their own drawings as textured cards ---
  const worn = Object.fromEntries(accessories.map((a) => [a.slot, a.id])) as Partial<Record<EquippedAccessory["slot"], string>>;
  /** A flat card in the creature's own plane (front or back of the body), its anchor at the group's origin. */
  const card = (texture: THREE.Texture) => {
    const g = new THREE.Group();
    const geo = geometry(new THREE.PlaneGeometry(ACCESSORY_PLANE, ACCESSORY_PLANE));
    const m = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false });
    disposables.push(m, texture);
    const plane = new THREE.Mesh(geo, m);
    plane.position.y = 8; // the SVG origin (the anchor) sits 8 units below the card's centre
    g.add(plane);
    return g;
  };
  /** The drawing always facing the camera, its anchor at the sprite's position: readable from every side, hidden by the body from behind. */
  const sprite = (texture: THREE.Texture) => {
    const m = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.08 });
    disposables.push(m, texture);
    const s = new THREE.Sprite(m);
    s.scale.set(ACCESSORY_PLANE, ACCESSORY_PLANE, 1);
    s.center.set(0.5, (ACCESSORY_PLANE - 44) / ACCESSORY_PLANE);
    return s;
  };
  const attach = (id: string | undefined, layer: "front" | "back", holder: THREE.Object3D, at: THREE.Vector3, shape: "card" | "sprite") => {
    if (!id) return;
    void textures(id, layer).then((texture) => {
      if (!texture || disposed) return;
      const c = shape === "sprite" ? sprite(texture) : card(texture);
      c.position.copy(at);
      holder.add(c);
    });
  };
  const neckX = X(layout.neck[0]);
  const neckY = Y(layout.neck[1]);
  attach(worn.head, "front", head, new THREE.Vector3(0, layout.head.cy - layout.top, 0), "sprite");
  attach(worn.eyes, "front", face, new THREE.Vector3(0, eyeY, surfaceZ(0, eyeY) + 1.5), "sprite");
  attach(worn.neck, "front", body, new THREE.Vector3(neckX, neckY, frontZ(neckX, neckY) / scales.body + 1.5), "sprite");
  attach(worn.body, "front", body, new THREE.Vector3(bodyCentre.x, bodyCentre.y, rz + 2), "card");
  attach(worn.body, "back", body, new THREE.Vector3(bodyCentre.x, bodyCentre.y, -rz - 2), "card");

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
  tube?: (color: string, points: [number, number, number][], radius: number) => THREE.Mesh;
  material?: (color: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial;
  geometry?: <G extends THREE.BufferGeometry>(g: G) => G;
};

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

function buildEars(
  type: EarType,
  layout: Layout,
  palette: SpeciesPalette,
  b: Required<Pick<Builders, "sphere" | "cone" | "geometry" | "material">>,
  place: (mesh: THREE.Object3D, lx: number, ly: number) => void,
) {
  if (type === "none") return;
  const inner = shade(palette.accent, 0.1);
  if (type === "horn") {
    const horn = new THREE.Group();
    horn.add(b.cone(palette.accent, 3.2, 17));
    place(horn, 0, layout.head.cy - (layout.top + 2));
    return;
  }
  for (const [point, side] of [
    [layout.ears.left, -1],
    [layout.ears.right, 1],
  ] as const) {
    const ear = new THREE.Group();
    switch (type) {
      case "fox": {
        ear.add(b.cone(palette.primary, 7, 20));
        const tip = b.cone(palette.secondary, 2.6, 7);
        tip.position.y = 16.5;
        ear.add(tip);
        const pad = b.cone(inner, 3.6, 10);
        pad.position.set(0, 1, 3.2);
        ear.add(pad);
        break;
      }
      case "rabbit": {
        const long = b.sphere(palette.primary, 4.6, 13.5, 3.2);
        long.position.y = 10;
        ear.add(long);
        const pad = b.sphere(inner, 2.3, 9.5, 1.6);
        pad.position.set(0, 10.5, 2.4);
        ear.add(pad);
        break;
      }
      case "round": {
        const ball = b.sphere(palette.primary, 6.5);
        ball.position.y = 2;
        ear.add(ball);
        const pad = b.sphere(inner, 3.3, 3.3, 1.6);
        pad.position.set(0, 2.5, 5.4);
        ear.add(pad);
        break;
      }
      case "horns":
        ear.add(b.cone(palette.secondary, 3, 12));
        ear.rotation.z = -side * 0.55;
        break;
      case "fold": {
        const flap = b.sphere(palette.primary, 5.5, 4, 3.4);
        flap.position.set(side * 1.5, 1.5, 0);
        ear.add(flap);
        break;
      }
      case "pig": {
        ear.add(b.cone(palette.primary, 5, 10));
        const pad = b.cone(inner, 2.6, 5.5);
        pad.position.set(0, 1, 2.4);
        ear.add(pad);
        ear.rotation.z = -side * 0.7;
        break;
      }
      case "antlers": {
        const wood = b.material(palette.secondary, { roughness: 0.8 });
        const trunk = new THREE.Mesh(b.geometry(new THREE.CylinderGeometry(1.2, 1.6, 16, 10)), wood);
        trunk.position.y = 8;
        ear.add(trunk);
        const branch = new THREE.Mesh(b.geometry(new THREE.CylinderGeometry(0.9, 1.1, 8, 10)), wood);
        branch.position.set(side * 3, 11, 0);
        branch.rotation.z = -side * 0.9;
        ear.add(branch);
        break;
      }
      default: {
        // cat
        ear.add(b.cone(palette.primary, 6, 15));
        const pad = b.cone(inner, 3.2, 8);
        pad.position.set(0, 1, 2.8);
        ear.add(pad);
      }
    }
    if (type !== "horns" && type !== "pig") ear.rotation.z = -side * 0.32;
    place(ear, point[0] - layout.head.cx, layout.head.cy - point[1]);
  }
}

/** Body markings as flat, translucent bumps on the surface (belly patch, spots, stripes); the others stay in 2D only. */
function buildBodyMarkings(
  type: MarkingType,
  layout: Layout,
  palette: SpeciesPalette,
  opacity: number,
  b: Pick<Builders, "sphere">,
  body: THREE.Group,
  surface: (x: number, y: number) => number,
) {
  const { cx, cy, rx, ry } = layout.body;
  const bump = (color: string, x: number, y: number, w: number, h: number, alpha: number) => {
    const m = b.sphere(color, w, h, 1.6, { transparent: true, opacity: alpha * opacity, depthWrite: false });
    m.position.set(X(x), Y(y), surface(X(x), Y(y)) - 0.7);
    body.add(m);
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
      bump(palette.secondary, cx - rx + 4, cy - 2, 1.4, 5, 0.8);
      bump(palette.secondary, cx + rx - 4, cy - 2, 1.4, 5, 0.8);
      return;
    default:
      return;
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

function buildExtra(
  type: ExtraType,
  layout: Layout,
  palette: SpeciesPalette,
  b: Required<Pick<Builders, "sphere" | "cone" | "material" | "geometry">>,
  ctx: { head: THREE.Group; body: THREE.Group; headR: number; rx: number; ry: number; rz: number; bodyCentre: THREE.Vector3 },
) {
  switch (type) {
    case "halo": {
      const halo = new THREE.Mesh(b.geometry(new THREE.TorusGeometry(12, 1.3, 12, 40)), b.material(palette.accent, { emissive: new THREE.Color(palette.accent), emissiveIntensity: 0.6 }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = ctx.headR + 8;
      ctx.head.add(halo);
      return;
    }
    case "wings":
      for (const side of [-1, 1]) {
        const wing = b.sphere(palette.secondary, 14, 8, 1.2, { transparent: true, opacity: 0.92 });
        wing.position.set(ctx.bodyCentre.x + side * (ctx.rx + 4), ctx.bodyCentre.y + ctx.ry * 0.4, -ctx.rz * 0.7);
        wing.rotation.z = side * 0.5;
        ctx.body.add(wing);
      }
      return;
    case "crystals":
      for (const x of [-6, 0, 6]) {
        const crystal = b.cone(palette.accent, 3, 10 + Math.abs(x) * 0.4, { emissive: new THREE.Color(palette.accent), emissiveIntensity: 0.35 });
        crystal.position.set(ctx.bodyCentre.x + x, ctx.bodyCentre.y + ctx.ry * 0.55, -ctx.rz * 0.8);
        crystal.rotation.x = 0.5;
        ctx.body.add(crystal);
      }
      return;
    case "flames":
      for (const x of [-6, 0, 6]) {
        const flame = b.cone("#f0a040", 3.5, 12 - Math.abs(x) * 0.4, { emissive: new THREE.Color("#ff6a00"), emissiveIntensity: 0.7 });
        flame.position.set(x, ctx.headR * 0.85, 0);
        flame.rotation.z = -x * 0.03;
        ctx.head.add(flame);
      }
      return;
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
