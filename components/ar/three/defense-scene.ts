import * as THREE from "three";
import { DEFENSE } from "@/lib/game/config";
import { bonusBlinking, eggPosition, tongueExtension, type DefenseState, type EffectKind } from "@/lib/game/defense";
import type { MouthPosition } from "./creature-mesh";
import { buildFoodMesh, type FoodMesh, type FoodModelKind } from "./food-mesh";

const SMOKE_PUFFS = 5;
const SHELL_BITS = 4;
/** Boss health bar (marker sides): width, height and how high above the model it floats. */
const BAR_WIDTH = 0.9;
const BAR_HEIGHT = 0.09;
const BAR_LIFT = 0.25;
const AIM_COLOR = 0xb9d3a4;
const SMOKE_COLOR = 0x9a948c;
const YOLK_COLOR = 0xf2c14e;
const OUCH_COLOR = 0xe0554a;
const HEAL_COLOR = 0x8fd18a;
const TONGUE_COLOR = 0xe88a9a;
const HEAL_SPARKS = 6;
/** Good foods bob a little above the paper; the tongue tip lands just above it. */
const BONUS_BOB = 0.04;
const TONGUE_TIP_HEIGHT = 0.15;

type EffectObject = { kind: EffectKind; group: THREE.Group; materials: THREE.Material[] };
type HealthBar = { back: THREE.Sprite; front: THREE.Sprite };
type EnemyObject = { kind: FoodModelKind; model: THREE.Group; shadow: THREE.Mesh; bar: HealthBar | null };

/**
 * Draws a "Défendre" game (spec § 3.21) inside the marker's frame: junk foods
 * as small 3D models (`food-mesh.ts`), eggs on their arc, smoke where a food
 * appears, a splat where an egg lands, a red flash when the creature is hit,
 * and the aim ring where the centre of the screen meets the paper. Objects
 * are pooled and reused; the state is never mutated here.
 */
export class DefenseScene {
  readonly root = new THREE.Group();
  private readonly templates = new Map<FoodModelKind, FoodMesh>();
  private readonly enemies = new Map<number, EnemyObject>();
  private readonly bonuses = new Map<number, EnemyObject>();
  private readonly freeModels = new Map<FoodModelKind, THREE.Group[]>();
  private readonly tongue = new THREE.Group();
  private readonly tongueBody: THREE.Mesh;
  private readonly tongueTip: THREE.Mesh;
  /** The defending creature's mouth, where the tongue leaves from (defaults until the creature is built). */
  private mouth: MouthPosition = { height: DEFENSE.tongueBaseHeight, front: DEFENSE.tongueBaseOffset };
  private readonly freeShadows: THREE.Mesh[] = [];
  private readonly freeBars: HealthBar[] = [];
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1210, transparent: true, opacity: 0.28, depthWrite: false });
  private readonly barBackMaterial = new THREE.SpriteMaterial({ color: 0x0b1210, transparent: true, opacity: 0.75, depthTest: false });
  private readonly barFrontMaterial = new THREE.SpriteMaterial({ color: 0xe0554a, depthTest: false });
  private readonly eggs = new Map<number, THREE.Mesh>();
  private readonly freeEggs: THREE.Mesh[] = [];
  private readonly effects = new Map<number, EffectObject>();
  private readonly freeEffects: Record<EffectKind, EffectObject[]> = { smoke: [], splat: [], ouch: [], hit: [], heal: [] };
  private readonly aim = new THREE.Group();
  private readonly sphere = new THREE.SphereGeometry(1, 14, 10);
  private readonly disc = new THREE.CircleGeometry(1, 28);
  private readonly eggMaterial = new THREE.MeshStandardMaterial({ color: 0xf6ecd6, roughness: 0.55 });
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    const ringGeometry = new THREE.RingGeometry(0.14, 0.2, 40);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    const dot = new THREE.Mesh(this.disc, ringMaterial);
    dot.scale.setScalar(0.035);
    this.aim.add(ring, dot);
    this.aim.position.z = 0.01;
    this.aim.visible = false;
    this.root.add(this.aim);
    const tongueMaterial = new THREE.MeshStandardMaterial({ color: TONGUE_COLOR, roughness: 0.5 });
    const tongueGeometry = new THREE.CylinderGeometry(0.045, 0.06, 1, 12);
    this.tongueBody = new THREE.Mesh(tongueGeometry, tongueMaterial);
    this.tongueTip = new THREE.Mesh(this.sphere, tongueMaterial);
    this.tongueTip.scale.setScalar(0.07);
    this.tongue.add(this.tongueBody, this.tongueTip);
    this.tongue.visible = false;
    this.root.add(this.tongue);
    this.disposables.push(this.sphere, this.disc, this.eggMaterial, ringGeometry, ringMaterial, this.shadowMaterial, this.barBackMaterial, this.barFrontMaterial, tongueMaterial, tongueGeometry);
  }

  /** A billboard health bar for a boss: a dark back and a red front that shrinks from the right. */
  private barFor(): HealthBar {
    const reused = this.freeBars.pop();
    if (reused) return reused;
    const back = new THREE.Sprite(this.barBackMaterial);
    back.scale.set(BAR_WIDTH + 0.04, BAR_HEIGHT + 0.04, 1);
    back.renderOrder = 10;
    const front = new THREE.Sprite(this.barFrontMaterial);
    front.scale.set(BAR_WIDTH, BAR_HEIGHT, 1);
    front.renderOrder = 11;
    this.root.add(back, front);
    return { back, front };
  }

  /** Tells the scene where the creature's mouth is, so the tongue comes out of it. */
  setMouth(mouth: MouthPosition | null) {
    if (mouth) this.mouth = mouth;
  }

  /** One model per food kind, built once and cloned per food (geometries and materials shared). */
  private modelFor(kind: FoodModelKind): THREE.Group {
    const free = this.freeModels.get(kind);
    const reused = free?.pop();
    if (reused) return reused;
    let template = this.templates.get(kind);
    if (!template) {
      template = buildFoodMesh(kind);
      this.templates.set(kind, template);
    }
    const model = template.root.clone(true);
    this.root.add(model);
    return model;
  }

  private buildEffect(kind: EffectKind): EffectObject {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    if (kind === "smoke") {
      for (let i = 0; i < SMOKE_PUFFS; i += 1) {
        const material = new THREE.MeshBasicMaterial({ color: SMOKE_COLOR, transparent: true, opacity: 0.7, depthWrite: false });
        const puff = new THREE.Mesh(this.sphere, material);
        const angle = (i / SMOKE_PUFFS) * Math.PI * 2;
        puff.userData = { dx: Math.cos(angle) * 0.13, dy: Math.sin(angle) * 0.13, dz: (i % 2) * 0.08, size: 0.9 + (i % 3) * 0.15 };
        group.add(puff);
        materials.push(material);
      }
    } else if (kind === "splat") {
      const yolkMaterial = new THREE.MeshBasicMaterial({ color: YOLK_COLOR, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const yolk = new THREE.Mesh(this.disc, yolkMaterial);
      yolk.name = "yolk";
      group.add(yolk);
      materials.push(yolkMaterial);
      for (let i = 0; i < SHELL_BITS; i += 1) {
        const material = new THREE.MeshBasicMaterial({ color: 0xfaf3e3, transparent: true, opacity: 1, depthWrite: false });
        const bit = new THREE.Mesh(this.sphere, material);
        const angle = (i / SHELL_BITS) * Math.PI * 2 + 0.4;
        bit.userData = { dx: Math.cos(angle), dy: Math.sin(angle) };
        bit.scale.setScalar(0.04);
        group.add(bit);
        materials.push(material);
      }
    } else if (kind === "hit") {
      const material = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.9, depthWrite: false });
      const flash = new THREE.Mesh(this.sphere, material);
      group.add(flash);
      materials.push(material);
    } else if (kind === "heal") {
      for (let i = 0; i < HEAL_SPARKS; i += 1) {
        const material = new THREE.MeshBasicMaterial({ color: HEAL_COLOR, transparent: true, opacity: 0.95, depthWrite: false });
        const spark = new THREE.Mesh(this.sphere, material);
        const a = (i / HEAL_SPARKS) * Math.PI * 2;
        spark.userData = { dx: Math.cos(a) * 0.14, dy: Math.sin(a) * 0.14, dz: (i % 3) * 0.06 };
        spark.scale.setScalar(0.035);
        group.add(spark);
        materials.push(material);
      }
    } else {
      const material = new THREE.MeshBasicMaterial({ color: OUCH_COLOR, transparent: true, opacity: 0.4, depthWrite: false });
      const flash = new THREE.Mesh(this.sphere, material);
      group.add(flash);
      materials.push(material);
    }
    this.disposables.push(...materials);
    this.root.add(group);
    return { kind, group, materials };
  }

  private animateEffect(object: EffectObject, progress: number, size: number) {
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

  /** Mirrors the game state (foods, eggs, effects) and the aim point into the scene. */
  sync(state: DefenseState | null, aim: { x: number; y: number } | null) {
    this.aim.visible = aim !== null;
    if (aim) this.aim.position.set(aim.x, aim.y, 0.01);

    const seenEnemies = new Set<number>();
    for (const enemy of state?.enemies ?? []) {
      seenEnemies.add(enemy.id);
      let entry = this.enemies.get(enemy.id);
      if (!entry) {
        const shadow = this.freeShadows.pop() ?? new THREE.Mesh(this.disc, this.shadowMaterial);
        shadow.position.z = 0.004;
        this.root.add(shadow);
        const model = this.modelFor(enemy.kind);
        model.scale.setScalar(enemy.scale);
        entry = { kind: enemy.kind, model, shadow, bar: enemy.boss ? this.barFor() : null };
        this.enemies.set(enemy.id, entry);
      }
      const moving = enemy.phase === "moving";
      entry.model.visible = moving;
      entry.shadow.visible = moving;
      entry.model.position.set(enemy.x, enemy.y, enemy.z);
      // Faces the creature, with a little wobble as it comes.
      entry.model.rotation.z = enemy.angle + Math.PI + 0.12 * Math.sin(enemy.age * 5 + enemy.seed * 6);
      entry.shadow.position.set(enemy.x, enemy.y, 0.004);
      entry.shadow.scale.setScalar((0.2 * enemy.scale) / (1 + enemy.z * 1.5));
      if (entry.bar) {
        const ratio = Math.max(0, Math.min(1, enemy.hits / enemy.maxHits));
        const top = enemy.z + 0.55 * enemy.scale + BAR_LIFT;
        entry.bar.back.visible = moving;
        entry.bar.front.visible = moving && ratio > 0;
        entry.bar.back.position.set(enemy.x, enemy.y, top);
        entry.bar.front.position.set(enemy.x, enemy.y, top);
        // Both sprites share the same anchor point: the front keeps its left edge on the back's by moving its centre as it shrinks.
        entry.bar.front.scale.x = BAR_WIDTH * ratio;
        if (ratio > 0) entry.bar.front.center.set(1 / (2 * ratio), 0.5);
      }
    }
    for (const [id, entry] of this.enemies) {
      if (seenEnemies.has(id)) continue;
      this.enemies.delete(id);
      entry.model.visible = false;
      entry.shadow.visible = false;
      const free = this.freeModels.get(entry.kind) ?? [];
      free.push(entry.model);
      this.freeModels.set(entry.kind, free);
      this.freeShadows.push(entry.shadow);
      if (entry.bar) {
        entry.bar.back.visible = false;
        entry.bar.front.visible = false;
        this.freeBars.push(entry.bar);
      }
    }

    // Good foods lying on the table, blinking before they vanish.
    const seenBonuses = new Set<number>();
    for (const bonus of state?.bonuses ?? []) {
      seenBonuses.add(bonus.id);
      let entry = this.bonuses.get(bonus.id);
      if (!entry) {
        const shadow = this.freeShadows.pop() ?? new THREE.Mesh(this.disc, this.shadowMaterial);
        this.root.add(shadow);
        const model = this.modelFor(bonus.kind);
        model.scale.setScalar(1);
        entry = { kind: bonus.kind, model, shadow, bar: null };
        this.bonuses.set(bonus.id, entry);
      }
      const shown = !bonusBlinking(bonus) || Math.floor(bonus.age * 8) % 2 === 0;
      entry.model.visible = shown;
      entry.shadow.visible = shown;
      entry.model.position.set(bonus.x, bonus.y, BONUS_BOB * (1 + Math.sin(bonus.age * 4)));
      entry.model.rotation.z = bonus.age * 1.2;
      entry.shadow.position.set(bonus.x, bonus.y, 0.004);
      entry.shadow.scale.setScalar(0.16);
    }
    for (const [id, entry] of this.bonuses) {
      if (seenBonuses.has(id)) continue;
      this.bonuses.delete(id);
      entry.model.visible = false;
      entry.shadow.visible = false;
      const free = this.freeModels.get(entry.kind) ?? [];
      free.push(entry.model);
      this.freeModels.set(entry.kind, free);
      this.freeShadows.push(entry.shadow);
    }

    // The tongue: a stretched cylinder from the creature's mouth down to the tip on the paper.
    const tongue = state?.tongue ?? null;
    this.tongue.visible = tongue !== null;
    if (tongue) {
      const ext = tongueExtension(tongue.t);
      // Out of the lower lip: just ahead of the mouth's surface, a touch below it.
      const baseOffset = this.mouth.front + 0.02;
      const baseHeight = Math.max(TONGUE_TIP_HEIGHT + 0.05, this.mouth.height - 0.04);
      const from = new THREE.Vector3(tongue.dir.x * baseOffset, tongue.dir.y * baseOffset, baseHeight);
      const reach = baseOffset + Math.max(0, tongue.length - baseOffset) * ext;
      const to = new THREE.Vector3(tongue.dir.x * reach, tongue.dir.y * reach, baseHeight + (TONGUE_TIP_HEIGHT - baseHeight) * ext);
      const span = to.clone().sub(from);
      const length = Math.max(0.05, span.length());
      this.tongueBody.position.copy(from).add(span.clone().multiplyScalar(0.5));
      this.tongueBody.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
      this.tongueBody.scale.set(1, length, 1);
      this.tongueTip.position.copy(to);
    }

    const seenEggs = new Set<number>();
    for (const egg of state?.eggs ?? []) {
      seenEggs.add(egg.id);
      let mesh = this.eggs.get(egg.id);
      if (!mesh) {
        mesh = this.freeEggs.pop() ?? new THREE.Mesh(this.sphere, this.eggMaterial);
        mesh.scale.set(0.1, 0.1, 0.13);
        this.root.add(mesh);
        this.eggs.set(egg.id, mesh);
      }
      const p = eggPosition(egg);
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.x = egg.t * 6;
    }
    for (const [id, mesh] of this.eggs) {
      if (seenEggs.has(id)) continue;
      this.eggs.delete(id);
      mesh.visible = false;
      this.freeEggs.push(mesh);
    }

    const seenEffects = new Set<number>();
    for (const effect of state?.effects ?? []) {
      seenEffects.add(effect.id);
      let object = this.effects.get(effect.id);
      if (!object) {
        object = this.freeEffects[effect.kind].pop() ?? this.buildEffect(effect.kind);
        object.group.visible = true;
        object.group.position.set(effect.x, effect.y, effect.z);
        this.effects.set(effect.id, object);
      }
      this.animateEffect(object, Math.min(1, effect.age / effect.duration), effect.size);
    }
    for (const [id, object] of this.effects) {
      if (seenEffects.has(id)) continue;
      this.effects.delete(id);
      object.group.visible = false;
      this.freeEffects[object.kind].push(object);
    }
  }

  /** Releases geometries and materials. */
  dispose() {
    this.root.removeFromParent();
    for (const template of this.templates.values()) template.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
