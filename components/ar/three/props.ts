import * as THREE from "three";
import { DEFENSE } from "@/lib/game/config";
import { tongueExtension, type EffectKind } from "@/lib/game/defense";
import type { MouthPosition } from "./creature-mesh";

/**
 * Small 3D props shared by the games on the marker ("Défendre", the arena):
 * pooled short effects, a tongue, billboard health bars. Everything lives in
 * a marker's frame (x right, y toward the top edge, z up, the side is 1).
 */

const SMOKE_PUFFS = 5;
const SHELL_BITS = 4;
const HEAL_SPARKS = 6;
const SMOKE_COLOR = 0x9a948c;
const YOLK_COLOR = 0xf2c14e;
const OUCH_COLOR = 0xe0554a;
const HEAL_COLOR = 0x8fd18a;
const TONGUE_COLOR = 0xe88a9a;
/** Health bar (marker sides): width, height. */
export const BAR_WIDTH = 0.9;
export const BAR_HEIGHT = 0.09;
/** The tongue tip lands just above the paper. */
const TONGUE_TIP_HEIGHT = 0.15;

export type EffectObject = { kind: EffectKind; group: THREE.Group; materials: THREE.Material[] };

/** Shared geometries of the props (one set per scene). */
export class PropGeometries {
  readonly sphere = new THREE.SphereGeometry(1, 14, 10);
  readonly disc = new THREE.CircleGeometry(1, 28);

  dispose() {
    this.sphere.dispose();
    this.disc.dispose();
  }
}

/** Smoke, egg splat, red flash, hit flash and heal sparks, recycled by kind. */
export class EffectPool {
  private readonly free: Record<EffectKind, EffectObject[]> = { smoke: [], splat: [], ouch: [], hit: [], heal: [] };
  private readonly materials: THREE.Material[] = [];

  constructor(private readonly geometries: PropGeometries) {}

  /** An effect object parented to `parent`, positioned at (x, y, z). */
  acquire(kind: EffectKind, parent: THREE.Object3D, x: number, y: number, z: number): EffectObject {
    const object = this.free[kind].pop() ?? this.build(kind);
    parent.add(object.group);
    object.group.visible = true;
    object.group.position.set(x, y, z);
    return object;
  }

  release(object: EffectObject) {
    object.group.visible = false;
    object.group.removeFromParent();
    this.free[object.kind].push(object);
  }

  private build(kind: EffectKind): EffectObject {
    const { sphere, disc } = this.geometries;
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    if (kind === "smoke") {
      for (let i = 0; i < SMOKE_PUFFS; i += 1) {
        const material = new THREE.MeshBasicMaterial({ color: SMOKE_COLOR, transparent: true, opacity: 0.7, depthWrite: false });
        const puff = new THREE.Mesh(sphere, material);
        const angle = (i / SMOKE_PUFFS) * Math.PI * 2;
        puff.userData = { dx: Math.cos(angle) * 0.13, dy: Math.sin(angle) * 0.13, dz: (i % 2) * 0.08, size: 0.9 + (i % 3) * 0.15 };
        group.add(puff);
        materials.push(material);
      }
    } else if (kind === "splat") {
      const yolkMaterial = new THREE.MeshBasicMaterial({ color: YOLK_COLOR, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const yolk = new THREE.Mesh(disc, yolkMaterial);
      yolk.name = "yolk";
      group.add(yolk);
      materials.push(yolkMaterial);
      for (let i = 0; i < SHELL_BITS; i += 1) {
        const material = new THREE.MeshBasicMaterial({ color: 0xfaf3e3, transparent: true, opacity: 1, depthWrite: false });
        const bit = new THREE.Mesh(sphere, material);
        const angle = (i / SHELL_BITS) * Math.PI * 2 + 0.4;
        bit.userData = { dx: Math.cos(angle), dy: Math.sin(angle) };
        bit.scale.setScalar(0.04);
        group.add(bit);
        materials.push(material);
      }
    } else if (kind === "hit") {
      const material = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.9, depthWrite: false });
      group.add(new THREE.Mesh(sphere, material));
      materials.push(material);
    } else if (kind === "heal") {
      for (let i = 0; i < HEAL_SPARKS; i += 1) {
        const material = new THREE.MeshBasicMaterial({ color: HEAL_COLOR, transparent: true, opacity: 0.95, depthWrite: false });
        const spark = new THREE.Mesh(sphere, material);
        const a = (i / HEAL_SPARKS) * Math.PI * 2;
        spark.userData = { dx: Math.cos(a) * 0.14, dy: Math.sin(a) * 0.14, dz: (i % 3) * 0.06 };
        spark.scale.setScalar(0.035);
        group.add(spark);
        materials.push(material);
      }
    } else {
      const material = new THREE.MeshBasicMaterial({ color: OUCH_COLOR, transparent: true, opacity: 0.4, depthWrite: false });
      group.add(new THREE.Mesh(sphere, material));
      materials.push(material);
    }
    this.materials.push(...materials);
    return { kind, group, materials };
  }

  /** Moves an effect along its life (`progress` 0–1). */
  animate(object: EffectObject, progress: number, size: number) {
    const fade = 1 - progress;
    if (object.kind === "smoke") {
      for (const child of object.group.children) {
        const d = child.userData as { dx: number; dy: number; dz: number; size: number };
        child.position.set(d.dx * (1 + progress) * size, d.dy * (1 + progress) * size, (d.dz + 0.25 * progress) * size);
        child.scale.setScalar((0.12 + 0.3 * progress) * d.size * size);
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
      }
    } else if (object.kind === "hit") {
      const flash = object.group.children[0] as THREE.Mesh;
      flash.scale.setScalar((0.12 + 0.3 * progress) * size);
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
    } else if (object.kind === "heal") {
      for (const child of object.group.children) {
        const d = child.userData as { dx: number; dy: number; dz: number };
        child.position.set(d.dx * (0.5 + progress), d.dy * (0.5 + progress), d.dz + 0.5 * progress);
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.95 * fade;
      }
    } else if (object.kind === "splat") {
      for (const child of object.group.children) {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (child.name === "yolk") {
          child.scale.setScalar(0.15 + 0.45 * progress);
          material.opacity = 0.9 * fade;
        } else {
          const d = child.userData as { dx: number; dy: number };
          const reach = 0.1 + 0.55 * progress;
          child.position.set(d.dx * reach, d.dy * reach, 0.05 + 0.5 * progress * fade);
          material.opacity = fade;
        }
      }
    } else {
      const flash = object.group.children[0] as THREE.Mesh;
      flash.scale.setScalar(0.75 + 0.3 * progress);
      (flash.material as THREE.MeshBasicMaterial).opacity = Math.min(0.7, 0.4 * size) * fade;
    }
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const span = new THREE.Vector3();

/** A creature's tongue: a stretched cylinder from the mouth down to the tip on the paper. */
export class TongueProp {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly tip: THREE.Mesh;
  private static material: THREE.MeshStandardMaterial | null = null;
  private static geometry: THREE.CylinderGeometry | null = null;
  private static users = 0;
  /** The mouth the tongue leaves from (defaults until the creature is built). */
  mouth: MouthPosition = { height: DEFENSE.tongueBaseHeight, front: DEFENSE.tongueBaseOffset };

  constructor(geometries: PropGeometries) {
    TongueProp.material ??= new THREE.MeshStandardMaterial({ color: TONGUE_COLOR, roughness: 0.5 });
    TongueProp.geometry ??= new THREE.CylinderGeometry(0.045, 0.06, 1, 12);
    TongueProp.users += 1;
    this.body = new THREE.Mesh(TongueProp.geometry, TongueProp.material);
    this.tip = new THREE.Mesh(geometries.sphere, TongueProp.material);
    this.tip.scale.setScalar(0.07);
    this.group.add(this.body, this.tip);
    this.group.visible = false;
  }

  /** Shows the tongue at motion progress `t` toward `dir` (unit vector) up to `length`, or hides it. */
  update(tongue: { dir: { x: number; y: number }; length: number; t: number } | null) {
    this.group.visible = tongue !== null;
    if (!tongue) return;
    const ext = tongueExtension(tongue.t);
    // Out of the lower lip: just ahead of the mouth's surface, a touch below it.
    const baseOffset = this.mouth.front + 0.02;
    const baseHeight = Math.max(TONGUE_TIP_HEIGHT + 0.05, this.mouth.height - 0.04);
    from.set(tongue.dir.x * baseOffset, tongue.dir.y * baseOffset, baseHeight);
    const reach = baseOffset + Math.max(0, tongue.length - baseOffset) * ext;
    to.set(tongue.dir.x * reach, tongue.dir.y * reach, baseHeight + (TONGUE_TIP_HEIGHT - baseHeight) * ext);
    span.copy(to).sub(from);
    const length = Math.max(0.05, span.length());
    this.body.position.copy(from).addScaledVector(span, 0.5);
    this.body.quaternion.setFromUnitVectors(UP, span.normalize());
    this.body.scale.set(1, length, 1);
    this.tip.position.copy(to);
  }

  dispose() {
    this.group.removeFromParent();
    TongueProp.users -= 1;
    if (TongueProp.users === 0) {
      TongueProp.material?.dispose();
      TongueProp.geometry?.dispose();
      TongueProp.material = null;
      TongueProp.geometry = null;
    }
  }
}

export type HealthBar = { back: THREE.Sprite; front: THREE.Sprite };

/** Billboard health bars: a dark back and a coloured front that shrinks from the right. */
export class HealthBarPool {
  private readonly free: HealthBar[] = [];
  private readonly backMaterial = new THREE.SpriteMaterial({ color: 0x0b1210, transparent: true, opacity: 0.75, depthTest: false });
  private readonly frontMaterial: THREE.SpriteMaterial;

  constructor(color = 0xe0554a) {
    this.frontMaterial = new THREE.SpriteMaterial({ color, depthTest: false });
  }

  acquire(parent: THREE.Object3D): HealthBar {
    const bar = this.free.pop() ?? this.build();
    parent.add(bar.back, bar.front);
    return bar;
  }

  release(bar: HealthBar) {
    bar.back.visible = false;
    bar.front.visible = false;
    bar.back.removeFromParent();
    bar.front.removeFromParent();
    this.free.push(bar);
  }

  private build(): HealthBar {
    const back = new THREE.Sprite(this.backMaterial);
    back.scale.set(BAR_WIDTH + 0.04, BAR_HEIGHT + 0.04, 1);
    back.renderOrder = 10;
    const front = new THREE.Sprite(this.frontMaterial);
    front.scale.set(BAR_WIDTH, BAR_HEIGHT, 1);
    front.renderOrder = 11;
    return { back, front };
  }

  /** Places a bar at (x, y, z) showing `ratio` (0–1) of health; hidden when `shown` is false. */
  static set(bar: HealthBar, x: number, y: number, z: number, ratio: number, shown: boolean) {
    const r = Math.max(0, Math.min(1, ratio));
    bar.back.visible = shown;
    bar.front.visible = shown && r > 0;
    bar.back.position.set(x, y, z);
    bar.front.position.set(x, y, z);
    // Both sprites share the same anchor point: the front keeps its left edge on the back's by moving its centre as it shrinks.
    bar.front.scale.x = BAR_WIDTH * r;
    if (r > 0) bar.front.center.set(1 / (2 * r), 0.5);
  }

  dispose() {
    this.backMaterial.dispose();
    this.frontMaterial.dispose();
  }
}
