import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EquippedAccessory } from "@/components/creatures/creature";
import { PIXEL_CELL, PIXEL_LEFT, PIXEL_PALETTES, PIXEL_TOP, pixelStageScale, type PixelRun, type PixelSprite, type PixelTone } from "@/lib/creatures/pixel";
import { createAccessoryAttacher } from "./accessory-attach";
import type { CreatureMesh, CreatureMeshInput } from "./creature-mesh";
import { UNIT } from "./units";

/** Thickness of the pixel plate, in cells: a chunky cookie standing on the marker. */
const DEPTH_CELLS = 4;

/**
 * A pixel-art species in 3D (spec § 3.19, level 3): its grid extruded into
 * voxels, one box per run of cells, merged per tone into four meshes, in the
 * tones of the creature's state. Eyes and mouth stand a touch proud of the
 * plate; the eyes blink like the drawn creatures. Accessories sit flat on
 * the plate (glasses, collars, outfits as volumes; hats facing the camera).
 */
export function buildPixelMesh(input: CreatureMeshInput, sprite: PixelSprite): CreatureMesh {
  const { stage, state, accessories } = input;
  const tones = PIXEL_PALETTES[state];
  const disposables: { dispose(): void }[] = [];
  let disposed = false;
  const cell = PIXEL_CELL;
  const depth = DEPTH_CELLS * cell;

  const root = new THREE.Group();
  root.scale.setScalar(UNIT * pixelStageScale(stage));

  /** Centre of a run in the creature's frame (x right, y up from the feet), drawing units. */
  const X = (col: number, w = 1) => PIXEL_LEFT + (col + w / 2) * cell - 50;
  const Y = (row: number, h = 1) => 92 - (PIXEL_TOP + (row + h / 2) * cell);

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (tone: PixelTone) => {
    let m = materials.get(tones[tone]);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tones[tone]), roughness: 0.85, metalness: 0 });
      materials.set(tones[tone], m);
      disposables.push(m);
    }
    return m;
  };
  /** One geometry for a set of runs, each a box, offset by `dz` and relative to (`ox`, `oy`). */
  const plate = (runs: readonly PixelRun[], dz = 0, ox = 0, oy = 0): THREE.BufferGeometry | null => {
    if (runs.length === 0) return null;
    const boxes = runs.map((r) => {
      const g = new THREE.BoxGeometry(r.w * cell, cell, depth);
      g.translate(X(r.x, r.w) - ox, Y(r.y) - oy, dz);
      return g;
    });
    const merged = mergeGeometries(boxes, false);
    for (const b of boxes) b.dispose();
    if (!merged) return null;
    disposables.push(merged);
    return merged;
  };

  for (const tone of [0, 1, 2, 3] as const) {
    const geometry = plate(sprite.runs[tone]);
    if (geometry) root.add(new THREE.Mesh(geometry, material(tone)));
  }
  const mouthGeometry = plate(sprite.mouth, 0.4);
  if (mouthGeometry) root.add(new THREE.Mesh(mouthGeometry, material(0)));

  // Eyes: each in its own group centred on its box, so a blink squashes it in place.
  const eyes: THREE.Object3D[] = [];
  for (const eye of sprite.eyes) {
    const group = new THREE.Group();
    const ox = X(eye.box.x, eye.box.w);
    const oy = Y(eye.box.y, eye.box.h);
    group.position.set(ox, oy, 0);
    const dark = plate(eye.cells, 0.4, ox, oy);
    if (dark) group.add(new THREE.Mesh(dark, material(0)));
    const light = plate([{ x: eye.highlight.x, y: eye.highlight.y, w: 1 }], 0.8, ox, oy);
    if (light) group.add(new THREE.Mesh(light, material(3)));
    root.add(group);
    eyes.push(group);
  }

  // Accessories, flat on the plate at the sprite's anchors.
  const worn = Object.fromEntries(accessories.map((a) => [a.slot, a.id])) as Partial<Record<EquippedAccessory["slot"], string>>;
  const { attach, solid } = createAccessoryAttacher(input, disposables, () => disposed);
  const flat = () => 0;
  const { anchors } = sprite;
  const front = depth / 2;
  attach(worn.head, "front", root, new THREE.Vector3(anchors.head[0] - 50, 92 - anchors.head[1], 0), "sprite");
  if (!solid(worn.eyes, "front", root, new THREE.Vector3(anchors.eyes[0] - 50, 92 - anchors.eyes[1], front + 1.5), flat)) {
    attach(worn.eyes, "front", root, new THREE.Vector3(anchors.eyes[0] - 50, 92 - anchors.eyes[1], front + 1.5), "sprite");
  }
  if (!solid(worn.neck, "front", root, new THREE.Vector3(0, 92 - anchors.neck[1], front + 1.2), flat)) {
    attach(worn.neck, "front", root, new THREE.Vector3(0, 92 - anchors.neck[1], front + 1.5), "sprite");
  }
  if (!solid(worn.body, "front", root, new THREE.Vector3(0, 92 - anchors.body[1], front + 1), flat)) {
    attach(worn.body, "front", root, new THREE.Vector3(0, 92 - anchors.body[1], front + 2), "card");
  }
  if (!solid(worn.body, "back", root, new THREE.Vector3(0, 92 - anchors.body[1], -front - 1), flat, -1)) {
    attach(worn.body, "back", root, new THREE.Vector3(0, 92 - anchors.body[1], -front - 2), "card");
  }

  // The mouth's place in the creature's frame (the tongue of "Défendre" leaves from there).
  const mouthRow = sprite.mouth.length > 0 ? sprite.mouth.reduce((s, r) => s + r.y, 0) / sprite.mouth.length : sprite.eyeCentre.y + 4;
  const scale = root.scale.y;
  const baseScaleY = scale;
  const blinkPeriod = 3.4 + (sprite.bounds.w % 7) / 10;
  return {
    root,
    mouth: { height: Y(mouthRow) * scale, front: (front + 0.4) * scale },
    animate(seconds) {
      if (state === "dead") return;
      root.scale.y = baseScaleY * (1 + 0.015 * Math.sin(seconds * 2.2));
      const phase = seconds % blinkPeriod;
      const blink = state !== "sick" && phase < 0.14 ? 0.12 : 1;
      for (const eye of eyes) eye.scale.y = blink;
    },
    dispose() {
      disposed = true;
      for (const d of disposables) d.dispose();
    },
  };
}
