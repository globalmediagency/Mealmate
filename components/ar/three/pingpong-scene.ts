import * as THREE from "three";
import { PINGPONG } from "@/lib/game/config";
import { ballProgress, inHitWindow, type PingPongEffect, type PingPongState } from "@/lib/game/pingpong";
import { EffectPool, PropGeometries, type EffectObject } from "./props";

const BALL_COLOR = 0xf7f0dc;
const BALL_SEAM = 0xd9822b;
const RING_COLOR = 0xf2c14e;
const RING_READY = 0x8fd18a;
const PADDLE_COLOR = 0xd64545;
const HANDLE_COLOR = 0xa0703a;
/** How long a swing and a ring flash are shown (ms). */
const SWING_MS = 260;
const EFFECT_MS = 500;
/** Where the paddle is held: beside the creature, toward the other paper. */
const PADDLE_DIST = 0.5;
const PADDLE_SIDE = 0.28;
const PADDLE_HEIGHT = 0.5;
/** Timing ring radii (marker sides): wide when the ball leaves, tight when it arrives. */
const RING_FAR = 1.15;
const RING_NEAR = 0.38;

export type PingPongSceneView = {
  state: PingPongState | null;
  /** Clock (ms) on the state's base. */
  now: number;
  /** The marker of each player's paper. */
  markers: Record<string, number>;
  /** A point of a marker's frame in the camera's frame (null when that marker was never seen). */
  worldPoint: (marker: number, x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3 | null;
  /** A point of the camera's frame in a marker's frame. */
  localPoint: (marker: number, world: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3 | null;
  mine: string;
};

type Layer = { marker: number; group: THREE.Group; ring: THREE.Mesh; ringMaterial: THREE.MeshBasicMaterial; paddle: THREE.Group; swingAt: number; swingSign: number };
type Live = { object: EffectObject; bornAt: number };

const from = new THREE.Vector3();
const to = new THREE.Vector3();
const up = new THREE.Vector3();
const base = new THREE.Vector3();
const scratch = new THREE.Vector3();
const local = new THREE.Vector3();
const Z_UP = new THREE.Vector3(0, 0, 1);

/** Direction (unit, in a marker's frame) from that paper to another one; straight ahead when the other was never seen. */
function towards(view: PingPongSceneView, marker: number, otherMarker: number | undefined): { dx: number; dy: number } {
  if (otherMarker !== undefined && view.worldPoint(otherMarker, 0, 0, 0, scratch) && view.localPoint(marker, scratch, local)) {
    const len = Math.hypot(local.x, local.y) || 1;
    return { dx: local.x / len, dy: local.y / len };
  }
  return { dx: 0, dy: -1 };
}

/** Where a creature holds its paddle, in its marker's frame: beside it, toward the other paper. */
function handPoint(dir: { dx: number; dy: number }): { x: number; y: number } {
  return { x: dir.dx * PADDLE_DIST - dir.dy * PADDLE_SIDE, y: dir.dy * PADDLE_DIST + dir.dx * PADDLE_SIDE };
}

/**
 * Draws a ping-pong match (spec § 3.25): the ball flying between the two
 * papers (in the camera's frame, on an arc from creature to creature), a
 * timing ring on the receiver's paper that tightens as the ball comes and
 * turns green inside the hit window, a paddle beside each creature that
 * swings on a hit, and short effects. Nothing is mutated here.
 */
export class PingPongScene {
  /** World-space objects (the ball and its shadow): the caller attaches it to the stage's scene. */
  readonly root = new THREE.Group();
  private readonly layers = new Map<number, Layer>();
  private readonly geometries = new PropGeometries();
  private readonly effectPool = new EffectPool(this.geometries);
  private readonly effects: Live[] = [];
  /** The ball (world space), read by the dev probes. */
  readonly ball: THREE.Group;
  private readonly shadow: THREE.Mesh;
  private readonly ballMaterial = new THREE.MeshStandardMaterial({ color: BALL_COLOR, roughness: 0.45 });
  private readonly seamMaterial = new THREE.MeshBasicMaterial({ color: BALL_SEAM });
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1210, transparent: true, opacity: 0.3, depthWrite: false });
  private readonly ringGeometry = new THREE.RingGeometry(0.86, 1, 48);
  private readonly paddleFace = new THREE.CircleGeometry(0.16, 28);
  private readonly paddleHandle = new THREE.CylinderGeometry(0.03, 0.035, 0.22, 10);
  private readonly paddleMaterial = new THREE.MeshStandardMaterial({ color: PADDLE_COLOR, roughness: 0.6, side: THREE.DoubleSide });
  private readonly handleMaterial = new THREE.MeshStandardMaterial({ color: HANDLE_COLOR, roughness: 0.8 });
  /** Point phase: where the ball dropped (world) and when. */
  private drop: { at: number; marker: number; x: number; y: number } | null = null;
  private lastPointAt = 0;

  constructor() {
    this.ball = new THREE.Group();
    const sphere = new THREE.Mesh(this.geometries.sphere, this.ballMaterial);
    sphere.scale.setScalar(PINGPONG.ballRadius);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(PINGPONG.ballRadius * 0.98, 0.012, 6, 32), this.seamMaterial);
    seam.rotation.x = Math.PI / 3;
    this.ball.add(sphere, seam);
    this.ball.visible = false;
    this.shadow = new THREE.Mesh(this.geometries.disc, this.shadowMaterial);
    this.shadow.scale.setScalar(PINGPONG.ballRadius * 1.1);
    this.shadow.visible = false;
    this.root.add(this.ball, this.shadow);
  }

  /** The group drawn in a marker's frame (created on first use; the caller attaches it to the stage). */
  layerFor(marker: number): THREE.Group {
    return this.ensureLayer(marker).group;
  }

  private ensureLayer(marker: number): Layer {
    let layer = this.layers.get(marker);
    if (!layer) {
      const group = new THREE.Group();
      const ringMaterial = new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
      ring.position.z = 0.012;
      ring.visible = false;
      const paddle = new THREE.Group();
      const face = new THREE.Mesh(this.paddleFace, this.paddleMaterial);
      face.position.y = 0.2;
      const handle = new THREE.Mesh(this.paddleHandle, this.handleMaterial);
      handle.position.y = 0.02;
      paddle.add(face, handle);
      paddle.visible = false;
      group.add(ring, paddle);
      layer = { marker, group, ring, ringMaterial, paddle, swingAt: -Infinity, swingSign: 1 };
      this.layers.set(marker, layer);
    }
    return layer;
  }

  /** Records a visual note from the state (a hit, a miss, a serve, a point). */
  note(effect: PingPongEffect, view: PingPongSceneView) {
    const marker = view.markers[effect.player];
    if (marker === undefined) return;
    const layer = this.ensureLayer(marker);
    if (effect.kind === "hit" || effect.kind === "serve") {
      layer.swingAt = view.now;
      layer.swingSign = effect.player === view.mine ? 1 : -1;
      if (effect.kind === "hit") this.spawn("hit", layer.group, 0, 0, PADDLE_HEIGHT + 0.1, view.now);
    } else if (effect.kind === "miss") {
      this.spawn("smoke", layer.group, 0, -0.35, 0.05, view.now);
      this.drop = { at: view.now, marker, x: 0.15, y: -0.55 };
    } else if (effect.kind === "point") {
      this.lastPointAt = view.now;
    }
  }

  private spawn(kind: EffectObject["kind"], parent: THREE.Object3D, x: number, y: number, z: number, now: number) {
    const object = this.effectPool.acquire(kind, parent, x, y, z);
    this.effectPool.animate(object, 0, 1);
    this.effects.push({ object, bornAt: now });
  }

  /** Moves everything to the state's instant. */
  sync(view: PingPongSceneView) {
    const { state, now } = view;
    const flight = state?.phase === "flight" ? state.flight : null;
    const receiverMarker = flight ? view.markers[flight.to] : undefined;
    // Each creature's hand (paddle) in its own frame, facing the other paper: the ball leaves from and arrives at the hands.
    const hands = new Map<number, { x: number; y: number; dir: { dx: number; dy: number } }>();
    if (state) {
      for (const player of state.players) {
        const marker = view.markers[player];
        if (marker === undefined) continue;
        const other = state.players.find((p) => p !== player);
        const dir = towards(view, marker, other !== undefined ? view.markers[other] : undefined);
        hands.set(marker, { ...handPoint(dir), dir });
      }
    }

    // The ball and its shadow.
    let ballShown = false;
    if (state && flight) {
      const fromMarker = view.markers[flight.from];
      const toMarker = view.markers[flight.to];
      const ha = fromMarker !== undefined ? hands.get(fromMarker) : undefined;
      const hb = toMarker !== undefined ? hands.get(toMarker) : undefined;
      const a = ha && fromMarker !== undefined ? view.worldPoint(fromMarker, ha.x, ha.y, PINGPONG.ballHeight, from) : null;
      const b = hb && toMarker !== undefined ? view.worldPoint(toMarker, hb.x, hb.y, PINGPONG.ballHeight, to) : null;
      if (a && b && ha && hb) {
        const { t, lift } = ballProgress(flight, now);
        view.worldPoint(fromMarker!, 0, 0, 1, up);
        view.worldPoint(fromMarker!, 0, 0, 0, base);
        up.sub(base).normalize();
        this.ball.position.copy(a).lerp(b, t).addScaledVector(up, PINGPONG.arcHeight * lift);
        this.ball.rotation.y += 0.15;
        this.ball.rotation.x += 0.05;
        // The shadow slides on the table under the ball.
        view.worldPoint(fromMarker!, ha.x, ha.y, 0.006, from);
        view.worldPoint(toMarker!, hb.x, hb.y, 0.006, to);
        this.shadow.position.copy(from).lerp(to, t);
        this.shadow.quaternion.setFromUnitVectors(Z_UP, up);
        this.shadow.scale.setScalar(PINGPONG.ballRadius * (1.4 - 0.5 * lift));
        ballShown = true;
      }
    } else if (state && state.phase === "serve") {
      const marker = view.markers[state.server];
      const hand = marker !== undefined ? hands.get(marker) : undefined;
      if (marker !== undefined && hand && view.worldPoint(marker, hand.x, hand.y, PINGPONG.ballHeight - 0.05 + 0.03 * Math.sin(now / 180), scratch)) {
        this.ball.position.copy(scratch);
        view.worldPoint(marker, hand.x, hand.y, 0.006, from);
        view.worldPoint(marker, 0, 0, 1, up);
        view.worldPoint(marker, 0, 0, 0, base);
        up.sub(base).normalize();
        this.shadow.position.copy(from);
        this.shadow.quaternion.setFromUnitVectors(Z_UP, up);
        this.shadow.scale.setScalar(PINGPONG.ballRadius * 1.1);
        ballShown = true;
      }
    } else if (state && state.phase === "point" && this.drop && now - this.drop.at < PINGPONG.pointPauseMs) {
      // The ball bounces on the table next to the creature that missed, then fades from sight.
      const age = (now - this.drop.at) / 1000;
      const bounce = Math.abs(Math.sin(age * 9)) * Math.max(0, 0.35 - age * 0.25);
      if (view.worldPoint(this.drop.marker, this.drop.x + age * 0.2, this.drop.y - age * 0.15, PINGPONG.ballRadius + bounce, scratch)) {
        this.ball.position.copy(scratch);
        this.shadow.visible = false;
        ballShown = true;
      }
    }
    this.ball.visible = ballShown;
    this.shadow.visible = ballShown && state?.phase !== "point";

    // Layers: the timing ring on the receiver's paper, the paddles.
    for (const layer of this.layers.values()) {
      const ringOn = flight !== null && receiverMarker === layer.marker;
      layer.ring.visible = ringOn;
      if (ringOn && flight) {
        const { t } = ballProgress(flight, now);
        const radius = RING_FAR + (RING_NEAR - RING_FAR) * t;
        layer.ring.scale.setScalar(radius);
        const ready = inHitWindow(flight, now);
        layer.ringMaterial.color.setHex(ready ? RING_READY : RING_COLOR);
        layer.ringMaterial.opacity = ready ? 0.95 : 0.55 + 0.35 * t;
      }
      // The paddle is held beside the creature, toward the other paper, and swings on a hit.
      const hand = hands.get(layer.marker);
      const { dx, dy } = hand?.dir ?? { dx: 0, dy: -1 };
      layer.paddle.visible = state !== null && state.phase !== "over" && hand !== undefined;
      layer.paddle.position.set(hand?.x ?? 0, hand?.y ?? -PADDLE_DIST, PADDLE_HEIGHT);
      const swing = now - layer.swingAt;
      const swingAngle = swing >= 0 && swing < SWING_MS ? Math.sin((swing / SWING_MS) * Math.PI) * 1.1 * layer.swingSign : 0;
      // Stand the paddle up (its face toward the other paper) and swing it about the paper's normal.
      layer.paddle.rotation.set(Math.PI / 2, 0, Math.atan2(dy, dx) - Math.PI / 2 + swingAngle);
    }

    // Short effects.
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const live = this.effects[i];
      const progress = (now - live.bornAt) / EFFECT_MS;
      if (progress >= 1) {
        this.effectPool.release(live.object);
        this.effects.splice(i, 1);
      } else this.effectPool.animate(live.object, Math.max(0, progress), 0.8);
    }
  }

  dispose() {
    for (const live of this.effects) this.effectPool.release(live.object);
    this.effects.length = 0;
    for (const layer of this.layers.values()) {
      layer.group.removeFromParent();
      layer.ringMaterial.dispose();
    }
    this.layers.clear();
    this.root.removeFromParent();
    this.ballMaterial.dispose();
    this.seamMaterial.dispose();
    this.shadowMaterial.dispose();
    this.ringGeometry.dispose();
    this.paddleFace.dispose();
    this.paddleHandle.dispose();
    this.paddleMaterial.dispose();
    this.handleMaterial.dispose();
    this.effectPool.dispose();
    this.geometries.dispose();
  }
}
