import * as THREE from "three";
import { bonusBlinking, eggPosition, type DefenseState, type EffectKind } from "@/lib/game/defense";
import type { MouthPosition } from "./creature-mesh";
import { buildFoodMesh, type FoodMesh, type FoodModelKind } from "./food-mesh";
import { EffectPool, HealthBarPool, PropGeometries, TongueProp, type EffectObject, type HealthBar } from "./props";

/** How high above a boss its health bar floats (marker sides). */
const BAR_LIFT = 0.25;
const AIM_COLOR = 0xb9d3a4;
/** Good foods bob a little above the paper. */
const BONUS_BOB = 0.04;

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
  private readonly geometries = new PropGeometries();
  private readonly effectPool = new EffectPool(this.geometries);
  private readonly bars = new HealthBarPool();
  private readonly tongue: TongueProp;
  private readonly freeShadows: THREE.Mesh[] = [];
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1210, transparent: true, opacity: 0.28, depthWrite: false });
  private readonly eggs = new Map<number, THREE.Mesh>();
  private readonly freeEggs: THREE.Mesh[] = [];
  private readonly effects = new Map<number, EffectObject>();
  private readonly aim = new THREE.Group();
  private readonly eggMaterial = new THREE.MeshStandardMaterial({ color: 0xf6ecd6, roughness: 0.55 });
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    const ringGeometry = new THREE.RingGeometry(0.14, 0.2, 40);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    const dot = new THREE.Mesh(this.geometries.disc, ringMaterial);
    dot.scale.setScalar(0.035);
    this.aim.add(ring, dot);
    this.aim.position.z = 0.01;
    this.aim.visible = false;
    this.root.add(this.aim);
    this.tongue = new TongueProp(this.geometries);
    this.root.add(this.tongue.group);
    this.disposables.push(this.eggMaterial, ringGeometry, ringMaterial, this.shadowMaterial, this.effectPool, this.bars, this.tongue, this.geometries);
  }

  /** Tells the scene where the creature's mouth is, so the tongue comes out of it. */
  setMouth(mouth: MouthPosition | null) {
    if (mouth) this.tongue.mouth = mouth;
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

  /** Mirrors the game state (foods, eggs, effects) and the aim point into the scene. */
  sync(state: DefenseState | null, aim: { x: number; y: number } | null) {
    this.aim.visible = aim !== null;
    if (aim) this.aim.position.set(aim.x, aim.y, 0.01);

    const seenEnemies = new Set<number>();
    for (const enemy of state?.enemies ?? []) {
      seenEnemies.add(enemy.id);
      let entry = this.enemies.get(enemy.id);
      if (!entry) {
        const shadow = this.freeShadows.pop() ?? new THREE.Mesh(this.geometries.disc, this.shadowMaterial);
        shadow.position.z = 0.004;
        this.root.add(shadow);
        const model = this.modelFor(enemy.kind);
        model.scale.setScalar(enemy.scale);
        entry = { kind: enemy.kind, model, shadow, bar: enemy.boss ? this.bars.acquire(this.root) : null };
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
      if (entry.bar) HealthBarPool.set(entry.bar, enemy.x, enemy.y, enemy.z + 0.55 * enemy.scale + BAR_LIFT, enemy.hits / enemy.maxHits, moving);
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
      if (entry.bar) this.bars.release(entry.bar);
    }

    // Good foods lying on the table, blinking before they vanish.
    const seenBonuses = new Set<number>();
    for (const bonus of state?.bonuses ?? []) {
      seenBonuses.add(bonus.id);
      let entry = this.bonuses.get(bonus.id);
      if (!entry) {
        const shadow = this.freeShadows.pop() ?? new THREE.Mesh(this.geometries.disc, this.shadowMaterial);
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

    this.tongue.update(state?.tongue ?? null);

    const seenEggs = new Set<number>();
    for (const egg of state?.eggs ?? []) {
      seenEggs.add(egg.id);
      let mesh = this.eggs.get(egg.id);
      if (!mesh) {
        mesh = this.freeEggs.pop() ?? new THREE.Mesh(this.geometries.sphere, this.eggMaterial);
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
        object = this.effectPool.acquire(effect.kind as EffectKind, this.root, effect.x, effect.y, effect.z);
        this.effects.set(effect.id, object);
      }
      this.effectPool.animate(object, Math.min(1, effect.age / effect.duration), effect.size);
    }
    for (const [id, object] of this.effects) {
      if (seenEffects.has(id)) continue;
      this.effects.delete(id);
      this.effectPool.release(object);
    }
  }

  /** Releases geometries and materials. */
  dispose() {
    this.root.removeFromParent();
    for (const template of this.templates.values()) template.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
