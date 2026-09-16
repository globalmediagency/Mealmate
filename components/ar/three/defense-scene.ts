import * as THREE from "three";
import { eggPosition, type DefenseState, type EffectKind, type JunkKind } from "@/lib/game/defense";
import { buildFoodMesh, type FoodMesh } from "./food-mesh";

const SMOKE_PUFFS = 5;
const SHELL_BITS = 4;
const AIM_COLOR = 0xb9d3a4;
const SMOKE_COLOR = 0x9a948c;
const YOLK_COLOR = 0xf2c14e;
const OUCH_COLOR = 0xe0554a;

type EffectObject = { kind: EffectKind; group: THREE.Group; materials: THREE.Material[] };

/**
 * Draws a "Défendre" game (spec § 3.21) inside the marker's frame: junk foods
 * as small 3D models (`food-mesh.ts`), eggs on their arc, smoke where a food
 * appears, a splat where an egg lands, a red flash when the creature is hit,
 * and the aim ring where the centre of the screen meets the paper. Objects
 * are pooled and reused; the state is never mutated here.
 */
export class DefenseScene {
  readonly root = new THREE.Group();
  private readonly templates = new Map<JunkKind, FoodMesh>();
  private readonly enemies = new Map<number, { kind: JunkKind; model: THREE.Group; shadow: THREE.Mesh }>();
  private readonly freeModels = new Map<JunkKind, THREE.Group[]>();
  private readonly freeShadows: THREE.Mesh[] = [];
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1210, transparent: true, opacity: 0.28, depthWrite: false });
  private readonly eggs = new Map<number, THREE.Mesh>();
  private readonly freeEggs: THREE.Mesh[] = [];
  private readonly effects = new Map<number, EffectObject>();
  private readonly freeEffects: Record<EffectKind, EffectObject[]> = { smoke: [], splat: [], ouch: [] };
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
    this.disposables.push(this.sphere, this.disc, this.eggMaterial, ringGeometry, ringMaterial, this.shadowMaterial);
  }

  /** One model per food kind, built once and cloned per food (geometries and materials shared). */
  private modelFor(kind: JunkKind): THREE.Group {
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

  private animateEffect(object: EffectObject, progress: number) {
    const fade = 1 - progress;
    if (object.kind === "smoke") {
      for (const child of object.group.children) {
        const d = child.userData as { dx: number; dy: number; dz: number; size: number };
        child.position.set(d.dx * (1 + progress), d.dy * (1 + progress), d.dz + 0.25 * progress);
        child.scale.setScalar((0.12 + 0.3 * progress) * d.size);
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
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
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.4 * fade;
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
        entry = { kind: enemy.kind, model: this.modelFor(enemy.kind), shadow };
        this.enemies.set(enemy.id, entry);
      }
      const moving = enemy.phase === "moving";
      entry.model.visible = moving;
      entry.shadow.visible = moving;
      entry.model.position.set(enemy.x, enemy.y, enemy.z);
      // Faces the creature, with a little wobble as it comes.
      entry.model.rotation.z = enemy.angle + Math.PI + 0.12 * Math.sin(enemy.age * 5 + enemy.seed * 6);
      entry.shadow.position.set(enemy.x, enemy.y, 0.004);
      entry.shadow.scale.setScalar(0.2 / (1 + enemy.z * 1.5));
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
      this.animateEffect(object, Math.min(1, effect.age / effect.duration));
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
