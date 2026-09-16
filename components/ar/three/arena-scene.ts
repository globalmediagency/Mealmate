import * as THREE from "three";
import { ARENA } from "@/lib/game/config";
import { eggPosition } from "@/lib/game/defense";
import type { ArenaLocalState } from "@/lib/game/arena-local";
import type { MouthPosition } from "./creature-mesh";
import { buildFoodMesh, type FoodMesh, type FoodModelKind } from "./food-mesh";
import { EffectPool, HealthBarPool, PropGeometries, TongueProp, type EffectObject, type HealthBar } from "./props";

const AIM_COLOR = 0xf2c14e;
/** Good foods bob a little above the paper. */
const BONUS_BOB = 0.04;
/** How high above a creature's top its health bar floats (marker sides). */
const BAR_LIFT = 0.22;

export type ArenaSceneBonus = { id: string; marker: number; x: number; y: number; kind: FoodModelKind; bornAt: number; expiresAt: number };
export type ArenaScenePlayer = { marker: number; hp: number; maxHp: number; mine: boolean; standing: boolean };

export type ArenaSceneView = {
  /** Where the crosshair meets the table, on one marker's frame. */
  aim: { marker: number; x: number; y: number } | null;
  players: ArenaScenePlayer[];
  bonuses: ArenaSceneBonus[];
  /** Clock (ms) on the same base as the bonuses' times. */
  now: number;
  /** Height of a creature's top above its paper (marker sides), for the health bars. */
  topOf: (marker: number) => number | null;
};

type Layer = { group: THREE.Group; tongue: TongueProp; bar: HealthBar | null };
type BonusObject = { kind: FoodModelKind; model: THREE.Group; shadow: THREE.Mesh };

/**
 * Draws an arena battle (spec § 3.22) across several markers: one layer per
 * marker (attached to the stage's slot of that marker) carrying the health
 * bar over the creature, its tongue, the good foods anchored to it, the eggs
 * whose flight is expressed in its frame and the short effects. The referee
 * state comes from the server, the animation from `ArenaLocalState`; nothing
 * is mutated here.
 */
export class ArenaScene {
  private readonly layers = new Map<number, Layer>();
  private readonly templates = new Map<FoodModelKind, FoodMesh>();
  private readonly freeModels = new Map<FoodModelKind, THREE.Group[]>();
  private readonly bonuses = new Map<string, BonusObject>();
  private readonly geometries = new PropGeometries();
  private readonly effectPool = new EffectPool(this.geometries);
  private readonly bars = new HealthBarPool();
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
    this.disposables.push(this.eggMaterial, ringGeometry, ringMaterial, this.shadowMaterial, this.effectPool, this.bars, this.geometries);
  }

  /** The group drawn in a marker's frame (created on first use; the caller attaches it to the stage). */
  layerFor(marker: number): THREE.Group {
    return this.ensureLayer(marker).group;
  }

  private ensureLayer(marker: number): Layer {
    let layer = this.layers.get(marker);
    if (!layer) {
      const group = new THREE.Group();
      const tongue = new TongueProp(this.geometries);
      group.add(tongue.group);
      layer = { group, tongue, bar: null };
      this.layers.set(marker, layer);
    }
    return layer;
  }

  /** Tells the scene where a creature's mouth is, so its tongue comes out of it. */
  setMouth(marker: number, mouth: MouthPosition | null) {
    if (mouth) this.ensureLayer(marker).tongue.mouth = mouth;
  }

  /** One model per food kind, built once and cloned per food (geometries and materials shared). */
  private modelFor(kind: FoodModelKind): THREE.Group {
    const reused = this.freeModels.get(kind)?.pop();
    if (reused) return reused;
    let template = this.templates.get(kind);
    if (!template) {
      template = buildFoodMesh(kind);
      this.templates.set(kind, template);
    }
    return template.root.clone(true);
  }

  private releaseModel(entry: BonusObject) {
    entry.model.visible = false;
    entry.model.removeFromParent();
    entry.shadow.visible = false;
    entry.shadow.removeFromParent();
    const free = this.freeModels.get(entry.kind) ?? [];
    free.push(entry.model);
    this.freeModels.set(entry.kind, free);
    this.freeShadows.push(entry.shadow);
  }

  /** Mirrors the referee view and the local animation into the layers. */
  sync(local: ArenaLocalState, view: ArenaSceneView) {
    // Aim ring on the marker the crosshair points at.
    this.aim.visible = view.aim !== null;
    if (view.aim) {
      const layer = this.ensureLayer(view.aim.marker);
      if (this.aim.parent !== layer.group) layer.group.add(this.aim);
      this.aim.position.set(view.aim.x, view.aim.y, 0.01);
    }

    // Health bars over the adversaries.
    const withBar = new Set<number>();
    for (const player of view.players) {
      if (player.mine) continue;
      const layer = this.ensureLayer(player.marker);
      withBar.add(player.marker);
      layer.bar ??= this.bars.acquire(layer.group);
      const top = view.topOf(player.marker) ?? 1;
      HealthBarPool.set(layer.bar, 0, 0, top + BAR_LIFT, player.hp / Math.max(1, player.maxHp), player.standing);
    }
    for (const [marker, layer] of this.layers) {
      if (layer.bar && !withBar.has(marker)) {
        this.bars.release(layer.bar);
        layer.bar = null;
      }
    }

    // Good foods lying on the table, blinking before they vanish.
    const seenBonuses = new Set<string>();
    for (const bonus of view.bonuses) {
      seenBonuses.add(bonus.id);
      const layer = this.ensureLayer(bonus.marker);
      let entry = this.bonuses.get(bonus.id);
      if (!entry) {
        const shadow = this.freeShadows.pop() ?? new THREE.Mesh(this.geometries.disc, this.shadowMaterial);
        const model = this.modelFor(bonus.kind);
        model.scale.setScalar(1);
        entry = { kind: bonus.kind, model, shadow };
        this.bonuses.set(bonus.id, entry);
      }
      if (entry.model.parent !== layer.group) layer.group.add(entry.model, entry.shadow);
      const age = Math.max(0, (view.now - bonus.bornAt) / 1000);
      const blinking = bonus.expiresAt - view.now <= ARENA.bonusBlinkSeconds * 1000;
      const shown = !blinking || Math.floor(age * 8) % 2 === 0;
      entry.model.visible = shown;
      entry.shadow.visible = shown;
      entry.model.position.set(bonus.x, bonus.y, BONUS_BOB * (1 + Math.sin(age * 4)));
      entry.model.rotation.z = age * 1.2;
      entry.shadow.position.set(bonus.x, bonus.y, 0.004);
      entry.shadow.scale.setScalar(0.16);
    }
    for (const [id, entry] of this.bonuses) {
      if (seenBonuses.has(id)) continue;
      this.bonuses.delete(id);
      this.releaseModel(entry);
    }

    // Tongues: at most one per creature.
    const withTongue = new Set<number>();
    for (const tongue of local.tongues) {
      if (withTongue.has(tongue.marker)) continue;
      withTongue.add(tongue.marker);
      this.ensureLayer(tongue.marker).tongue.update(tongue);
    }
    for (const [marker, layer] of this.layers) if (!withTongue.has(marker)) layer.tongue.update(null);

    // Eggs in flight, each in the frame of its own marker.
    const seenEggs = new Set<number>();
    for (const egg of local.eggs) {
      seenEggs.add(egg.id);
      const layer = this.ensureLayer(egg.marker);
      let mesh = this.eggs.get(egg.id);
      if (!mesh) {
        mesh = this.freeEggs.pop() ?? new THREE.Mesh(this.geometries.sphere, this.eggMaterial);
        mesh.scale.set(0.1, 0.1, 0.13);
        this.eggs.set(egg.id, mesh);
      }
      if (mesh.parent !== layer.group) layer.group.add(mesh);
      const p = eggPosition(egg);
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.x = egg.t * 6;
    }
    for (const [id, mesh] of this.eggs) {
      if (seenEggs.has(id)) continue;
      this.eggs.delete(id);
      mesh.visible = false;
      mesh.removeFromParent();
      this.freeEggs.push(mesh);
    }

    // Short effects.
    const seenEffects = new Set<number>();
    for (const effect of local.effects) {
      seenEffects.add(effect.id);
      let object = this.effects.get(effect.id);
      if (!object) {
        object = this.effectPool.acquire(effect.kind, this.ensureLayer(effect.marker).group, effect.x, effect.y, effect.z);
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
    for (const layer of this.layers.values()) {
      layer.tongue.dispose();
      layer.group.removeFromParent();
    }
    this.layers.clear();
    for (const template of this.templates.values()) template.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
