"use client";

import { Egg, Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as THREE from "three";
import { CameraError, MarkerCamera, type CameraFrame, type Corner } from "@/components/ar/marker-camera";
import { AccessorySprites, accessoryMarkup } from "@/components/ar/three/accessory-sprites";
import type { ArenaScene, ArenaSceneBonus, ArenaScenePlayer } from "@/components/ar/three/arena-scene";
import type { CreatureMeshInput } from "@/components/ar/three/creature-mesh";
import type { ThreeStage } from "@/components/ar/three/stage";
import type { ArCreature } from "@/components/ar/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ArenaEventView, ArenaPlayerView, ArenaSnapshot } from "@/lib/arena/service";
import { NonceMemory, randomNonce } from "@/lib/arena/rtc-protocol";
import { getSpecies } from "@/lib/creatures";
import { arenaAimTarget, arenaSecondsLeft, type AimCandidate } from "@/lib/game/arena";
import { addLocalEffect, addLocalEgg, addLocalTongue, createArenaLocal, lickLocal, shootLocal, stepArenaLocal, sweptByTongue, type ArenaLocalState, type Vec3 } from "@/lib/game/arena-local";
import { ARENA } from "@/lib/game/config";
import { clampAim, yawToward, type Vec2 } from "@/lib/game/defense";
import type { FoodModelKind } from "@/components/ar/three/food-mesh";
import { cn } from "@/lib/utils/cn";
import { linkKey, linkLabel } from "./link-label";
import { NO_LINK, type ArenaTransport, type LinkState } from "./transport";

type StageModule = typeof import("@/components/ar/three/stage");
type SceneModule = typeof import("@/components/ar/three/arena-scene");
type TexturePromise = ReturnType<StageModule["textureFromSvg"]>;

type Phase = "intro" | "starting" | "live" | "paused";
type Problem = "unsupported" | "denied" | "error" | "nogl" | null;
type OtherHud = { userId: string; username: string; hp: number; standing: boolean };
type Hud = {
  status: ArenaSnapshot["match"]["status"];
  secondsLeft: number;
  hp: number;
  maxHp: number;
  standing: boolean;
  /** Markers seen right now, and whether the player's own is among them. */
  seen: number;
  mineSeen: boolean;
  ever: boolean;
  target: string | null;
  others: OtherHud[];
  /** The direct link between the phones, when the admin enabled it. */
  link: LinkState;
};

export type ArenaGameProps = {
  transport: ArenaTransport;
  initial: ArenaSnapshot;
  /** Dev screens: exposes the scene and the local state on `window` for the tests. */
  preview?: boolean;
  /** Called when the player gives up from the game box. */
  onLeave?: () => void;
};

/** The marker may flicker: its last pose is kept this long before the creature disappears. */
const HOLD_MS = 1200;
/** Longest simulated sub-step: a slow frame is simulated in several steps, so an egg never skips its landing. */
const MAX_DT = 0.05;
/** A frame longer than this (tab hidden, phone busy) is not caught up: the flight simply pauses for the rest. */
const MAX_FRAME_SECONDS = 0.5;
/** How fast a creature turns toward its last shot (radians per second, proportional). */
const YAW_SPEED = 10;
const TWO_PI = Math.PI * 2;
/** An egg thrown by a phone whose own creature is out of view starts from the phone itself. */
const CAMERA_HAND = new THREE.Vector3(0, -0.12, -0.05);

const IDLE_HUD: Hud = { status: "lobby", secondsLeft: 0, hp: 0, maxHp: 0, standing: true, seen: 0, mineSeen: false, ever: false, target: null, others: [], link: NO_LINK };

const participants = (snapshot: ArenaSnapshot): ArenaPlayerView[] => snapshot.players.filter((p) => p.status === "ready" || p.status === "left");
const isStanding = (p: ArenaPlayerView) => p.status === "ready" && p.hp > 0 && !p.eliminatedAt;

/**
 * "Arène" (spec § 3.22), the battle as one phone sees it: the camera reads
 * every creature's marker on the table, the crosshair picks the nearest
 * adversary, eggs fly in the frame of the shooter's paper and are judged in
 * the target's, the tongue sweeps the good foods lying around. The referee
 * (health, bonuses, end of the match) is the server, reached through the
 * transport; the eggs and tongues of the others are replayed from its events.
 */
export function ArenaGame({ transport, initial, preview = false, onLeave }: ArenaGameProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [problem, setProblem] = useState<Problem>(null);
  const [hud, setHud] = useState<Hud>(IDLE_HUD);
  const phaseRef = useRef<Phase>("intro");
  const hudRef = useRef<Hud>(IDLE_HUD);
  const latest = useRef<ArenaSnapshot>(initial);
  const pendingEvents = useRef<ArenaEventView[]>([]);
  const eatenLocally = useRef(new Set<string>());
  /** Eggs and tongues already drawn, whichever path (direct link or server event) brought them first. */
  const nonces = useRef(new NonceMemory());
  const video = useRef<HTMLVideoElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const sprites = useRef<HTMLDivElement>(null);
  const camera = useRef<MarkerCamera | null>(null);
  const stage = useRef<ThreeStage | null>(null);
  const scene = useRef<ArenaScene | null>(null);
  const stageModule = useRef<StageModule | null>(null);
  const sceneModule = useRef<SceneModule | null>(null);
  const textures = useRef(new Map<string, TexturePromise>());
  const local = useRef<ArenaLocalState>(createArenaLocal());
  const aim = useRef<{ target: (AimCandidate & { marker: number }) | null; own: Vec2 | null }>({ target: null, own: null });
  const yaws = useRef(new Map<number, { wanted: number; current: number }>());
  const lastSeen = useRef(new Map<number, number>());
  const lastFrame = useRef(0);
  const world = useRef(new THREE.Vector3());
  const localVec = useRef(new THREE.Vector3());

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  // Every snapshot lands in a ref (the loop reads it); its new events wait for the next frame.
  useEffect(() => {
    latest.current = transport.snapshot ?? initial;
    const offSnapshots = transport.subscribe((snapshot) => {
      latest.current = snapshot;
      if (snapshot.events.length > 0) pendingEvents.current.push(...snapshot.events);
    });
    const offPeers = transport.subscribePeers((event) => pendingEvents.current.push(event));
    return () => {
      offSnapshots();
      offPeers();
    };
  }, [transport, initial]);

  /** Releases the camera and the 3D scene (the local animation is dropped, the referee keeps going). */
  const teardown = useCallback(() => {
    camera.current?.stop();
    camera.current = null;
    scene.current?.dispose();
    scene.current = null;
    stage.current?.dispose();
    stage.current = null;
    for (const promise of textures.current.values()) void promise.then((t) => t?.dispose());
    textures.current.clear();
    local.current = createArenaLocal();
    pendingEvents.current = [];
    aim.current = { target: null, own: null };
    yaws.current.clear();
    lastSeen.current.clear();
    lastFrame.current = 0;
    hudRef.current = IDLE_HUD;
  }, []);

  useEffect(() => teardown, [teardown]);

  // The camera drains the battery: pause when the tab goes to the background.
  useEffect(() => {
    const onHide = () => {
      if (!document.hidden) return;
      const current = phaseRef.current;
      if (current === "live") {
        teardown();
        go("paused");
      } else if (current === "starting") {
        teardown();
        go("intro");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [teardown]);

  function textureFor(key: string, markup: string | null): TexturePromise {
    let promise = textures.current.get(key);
    if (!promise) {
      const three = stageModule.current;
      promise = markup && three ? three.textureFromSvg(markup) : Promise.resolve(null);
      textures.current.set(key, promise);
    }
    return promise;
  }

  function meshInput(creature: ArCreature): CreatureMeshInput | null {
    const species = getSpecies(creature.speciesId);
    if (!species) return null;
    return {
      species,
      stage: creature.stage,
      state: creature.state,
      accessories: creature.accessories,
      textures: (accessoryId, layer) => textureFor(`acc/${species.id}/${accessoryId}/${layer}`, accessoryMarkup(sprites.current, species.id, accessoryId, layer)),
      markup: (accessoryId, layer) => accessoryMarkup(sprites.current, species.id, accessoryId, layer),
    };
  }

  /** The 3D stage is created once the video size is known and the canvas mounted; without WebGL the game cannot run. */
  function ensureStage(videoWidth: number, videoHeight: number): ThreeStage | null {
    if (stage.current) {
      stage.current.resize(videoWidth, videoHeight);
      return stage.current;
    }
    const canvas = glCanvas.current;
    const stageMod = stageModule.current;
    const sceneMod = sceneModule.current;
    if (!canvas || !stageMod || !sceneMod) return null;
    try {
      const created = new stageMod.ThreeStage(canvas, videoWidth, videoHeight);
      stage.current = created;
      scene.current = new sceneMod.ArenaScene();
      if (preview) {
        const w = window as unknown as { __arenaScene?: unknown; __arenaLocal?: unknown };
        w.__arenaScene = scene.current;
        w.__arenaLocal = local.current;
      }
      return created;
    } catch (err) {
      console.warn("[arena] WebGL unavailable", err);
      teardown();
      setProblem("nogl");
      go("intro");
      return null;
    }
  }

  /** A point of marker `from`'s frame expressed in marker `to`'s frame (null when either is unknown). */
  function convert(s: ThreeStage, from: number, to: number, x: number, y: number, z: number): Vec3 | null {
    if (from === to) return { x, y, z };
    const w = s.worldPoint(from, x, y, z, world.current);
    if (!w) return null;
    const l = s.localPoint(to, w, localVec.current);
    return l ? { x: l.x, y: l.y, z: l.z } : null;
  }

  /** Where a creature's mouth is in its own frame, looking toward `dir` (unit vector). */
  function mouthPoint(s: ThreeStage, marker: number, dir: Vec2): Vec3 {
    const mouth = s.mouthOf(marker) ?? { height: 0.8, front: 0.4 };
    return { x: dir.x * mouth.front, y: dir.y * mouth.front, z: mouth.height };
  }

  function turnToward(marker: number, point: Vec2) {
    const entry = yaws.current.get(marker) ?? { wanted: 0, current: 0 };
    entry.wanted = yawToward(point);
    yaws.current.set(marker, entry);
  }

  /** The health bar of a player drops (or rises) at once; the referee confirms at the next poll. */
  function optimisticHp(player: ArenaPlayerView | undefined, delta: number) {
    if (!player) return;
    player.hp = Math.max(0, Math.min(latest.current.match.maxHp, player.hp + delta));
  }

  /**
   * Replays what the others did since the last frame: their eggs fly toward
   * their target, their tongues come out. Server events and direct-link
   * messages describe the same shots (same `nonce`): the first one to arrive
   * draws it, the other is skipped. A direct-link "hit" brings the verdict
   * of an egg still in flight; "eat" removes the good foods a tongue took.
   */
  function replayEvents(s: ThreeStage) {
    const snapshot = latest.current;
    const me = snapshot.me?.userId;
    const byUser = new Map(snapshot.players.map((p) => [p.userId, p]));
    const events = pendingEvents.current;
    pendingEvents.current = [];
    for (const event of events) {
      if (!event.actorId || event.actorId === me) continue;
      const actor = byUser.get(event.actorId);
      if (!actor) continue;
      const payload = event.payload as Record<string, unknown>;
      const nonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
      if (event.kind === "egg") {
        if (!nonces.current.add(nonce)) continue;
        const targetId = typeof payload.target === "string" ? payload.target : null;
        const target = targetId ? byUser.get(targetId) : undefined;
        const marker = target?.markerId ?? actor.markerId;
        const x = typeof payload.x === "number" ? payload.x : 0;
        const y = typeof payload.y === "number" ? payload.y : 0;
        // Server events carry the verdict; a direct-link egg learns it from the "hit" that follows.
        const hit = typeof payload.hit === "boolean" ? payload.hit : null;
        if (!s.isTracked(marker)) continue;
        let from: Vec3 = { x, y, z: 1.6 };
        if (s.isTracked(actor.markerId)) {
          const towards = convert(s, marker, actor.markerId, x, y, 0);
          if (towards) {
            const len = Math.hypot(towards.x, towards.y) || 1;
            const dir = { x: towards.x / len, y: towards.y / len };
            turnToward(actor.markerId, towards);
            const mouth = mouthPoint(s, actor.markerId, dir);
            from = convert(s, actor.markerId, marker, mouth.x, mouth.y, mouth.z) ?? from;
          }
        }
        addLocalEgg(local.current, { marker, from, to: { x, y, z: 0 }, own: false, targetMarker: target ? marker : null, targetUserId: targetId, nonce, hit });
      } else if (event.kind === "hit") {
        if (!nonces.current.add(nonce ? `hit:${nonce}` : undefined)) continue;
        const hit = payload.hit === true;
        const targetId = typeof payload.target === "string" ? payload.target : null;
        const target = targetId ? byUser.get(targetId) : undefined;
        const flying = local.current.eggs.find((e) => e.nonce !== undefined && e.nonce === nonce);
        if (flying) {
          flying.hit = hit;
          if (target && typeof payload.x === "number" && typeof payload.y === "number") flying.to = { x: payload.x, y: payload.y, z: 0 };
        } else if (hit && target && s.isTracked(target.markerId)) {
          const top = s.topOf(target.markerId) ?? 1;
          addLocalEffect(local.current, target.markerId, "hit", typeof payload.x === "number" ? payload.x : 0, typeof payload.y === "number" ? payload.y : 0, top * 0.45, 1);
          addLocalEffect(local.current, target.markerId, "ouch", 0, 0, top * 0.5, 1.2);
        }
        if (hit) optimisticHp(target, -snapshot.match.eggDamage);
      } else if (event.kind === "tongue") {
        if (!nonces.current.add(nonce)) continue;
        const angle = typeof payload.angle === "number" ? payload.angle : 0;
        const length = typeof payload.length === "number" ? payload.length : 1.2;
        const ids = Array.isArray(payload.bonusIds) ? (payload.bonusIds as string[]) : [];
        for (const id of ids) eatenLocally.current.add(id);
        if (!s.isTracked(actor.markerId)) continue;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        turnToward(actor.markerId, { x: dir.x, y: dir.y });
        addLocalTongue(local.current, { marker: actor.markerId, dir, length, own: false });
        const healed = typeof payload.healed === "number" ? payload.healed : 0;
        if (healed > 0) {
          const top = s.topOf(actor.markerId) ?? 1;
          addLocalEffect(local.current, actor.markerId, "heal", 0, 0, top * 0.5, 1);
        }
      } else if (event.kind === "eat") {
        if (!nonces.current.add(nonce ? `eat:${nonce}` : undefined)) continue;
        const ids = Array.isArray(payload.bonusIds) ? (payload.bonusIds as string[]) : [];
        let heal = 0;
        for (const id of ids) {
          const bonus = snapshot.bonuses.find((b) => b.id === id);
          if (bonus && !eatenLocally.current.has(id)) heal += bonus.heal;
          eatenLocally.current.add(id);
        }
        if (heal > 0) {
          optimisticHp(actor, heal);
          if (s.isTracked(actor.markerId)) addLocalEffect(local.current, actor.markerId, "heal", 0, 0, (s.topOf(actor.markerId) ?? 1) * 0.5, 1);
        }
      } else if (event.kind === "eliminated") {
        if (s.isTracked(actor.markerId)) addLocalEffect(local.current, actor.markerId, "ouch", 0, 0, (s.topOf(actor.markerId) ?? 1) * 0.5, 1.6);
      }
    }
  }

  /** Judges an own egg where it lands, in the target's current frame, and tells the referee and the other phones. */
  function judgeLanding(s: ThreeStage, egg: ReturnType<typeof addLocalEgg>) {
    const snapshot = latest.current;
    if (!egg.own) {
      const target = egg.targetUserId ? snapshot.players.find((p) => p.userId === egg.targetUserId) : undefined;
      const hit = egg.hit ?? (target !== undefined && Math.hypot(egg.to.x, egg.to.y) <= ARENA.hitRadius);
      if (hit) {
        const top = s.topOf(egg.marker) ?? 1;
        addLocalEffect(local.current, egg.marker, "hit", egg.to.x, egg.to.y, top * 0.45, 1);
        addLocalEffect(local.current, egg.marker, "ouch", 0, 0, top * 0.5, 1.2);
      } else addLocalEffect(local.current, egg.marker, "splat", egg.to.x, egg.to.y, 0, 0.55);
      return;
    }
    if (egg.targetMarker === null || !egg.targetUserId) {
      addLocalEffect(local.current, egg.marker, "splat", egg.to.x, egg.to.y, 0, 0.55);
      void transport.shoot({ targetUserId: null, x: egg.to.x, y: egg.to.y, hit: false, nonce: egg.nonce });
      if (egg.nonce) transport.broadcast({ t: "hit", nonce: egg.nonce, target: null, x: egg.to.x, y: egg.to.y, hit: false });
      return;
    }
    const target = snapshot.players.find((p) => p.userId === egg.targetUserId);
    const point = convert(s, egg.marker, egg.targetMarker, egg.to.x, egg.to.y, egg.to.z) ?? egg.to;
    const hit = target !== undefined && isStanding(target) && Math.hypot(point.x, point.y) <= ARENA.hitRadius;
    if (hit) {
      const top = s.topOf(egg.targetMarker) ?? 1;
      addLocalEffect(local.current, egg.targetMarker, "hit", point.x, point.y, top * 0.45, 1);
      addLocalEffect(local.current, egg.targetMarker, "ouch", 0, 0, top * 0.5, 1.2);
      // Optimistic: the bar drops now, the referee confirms at the next poll.
      optimisticHp(target, -snapshot.match.eggDamage);
    } else addLocalEffect(local.current, egg.targetMarker, "splat", point.x, point.y, 0, 0.55);
    void transport.shoot({ targetUserId: egg.targetUserId, x: point.x, y: point.y, hit, nonce: egg.nonce });
    if (egg.nonce) transport.broadcast({ t: "hit", nonce: egg.nonce, target: egg.targetUserId, x: point.x, y: point.y, hit });
  }

  /** Resolves the own tongue at full extension: the good foods on its path, wherever they are anchored. */
  function resolveTongue(s: ThreeStage, tongue: ReturnType<typeof addLocalTongue>) {
    const snapshot = latest.current;
    const myMarker = snapshot.me?.markerId;
    if (myMarker === undefined) return;
    const byUser = new Map(snapshot.players.map((p) => [p.userId, p.markerId]));
    const candidates: Array<{ id: string; x: number; y: number }> = [];
    for (const bonus of snapshot.bonuses) {
      if (eatenLocally.current.has(bonus.id)) continue;
      const anchor = byUser.get(bonus.anchorUserId);
      if (anchor === undefined || !s.isTracked(anchor)) continue;
      const point = convert(s, anchor, myMarker, bonus.x, bonus.y, 0);
      if (point) candidates.push({ id: bonus.id, x: point.x, y: point.y });
    }
    const swept = sweptByTongue(tongue, candidates);
    for (const item of swept) eatenLocally.current.add(item.id);
    if (swept.length > 0) addLocalEffect(local.current, myMarker, "heal", 0, 0, (s.topOf(myMarker) ?? 1) * 0.5, 1);
    const bonusIds = swept.map((b) => b.id);
    void transport.lick({ bonusIds, angle: Math.atan2(tongue.dir.y, tongue.dir.x), length: tongue.length, nonce: tongue.nonce });
    if (tongue.nonce) transport.broadcast({ t: "eat", nonce: tongue.nonce, bonusIds });
  }

  function onFrame(frame: CameraFrame) {
    const s = ensureStage(frame.videoWidth, frame.videoHeight);
    const sc = scene.current;
    if (!s || !sc) return;
    const snapshot = latest.current;
    const players = participants(snapshot);
    const byMarker = new Map(players.map((p) => [p.markerId, p]));
    const me = snapshot.me;
    const myMarker = me?.markerId ?? null;

    const detections = new Map<number, Corner[]>();
    for (const found of frame.markers) {
      const player = byMarker.get(found.id);
      if (!player?.creature) continue;
      if (!s.isTracked(found.id)) {
        const input = meshInput(player.creature);
        if (!input) continue;
        s.ensureTarget(found.id, input);
        s.attach(found.id, sc.layerFor(found.id));
        sc.setMouth(found.id, s.mouthOf(found.id));
      }
      detections.set(found.id, found.corners);
      lastSeen.current.set(found.id, frame.now);
    }
    const visible = new Set<number>();
    const holdFor = Math.max(HOLD_MS, 3 * frame.period);
    for (const [id, at] of lastSeen.current) if (frame.now - at < holdFor) visible.add(id);
    s.update(detections, visible);

    // Aim: the nearest adversary the crosshair points at; otherwise the own paper, for the tongue.
    const candidates: Array<AimCandidate & { marker: number }> = [];
    for (const player of players) {
      if (player.mine || !isStanding(player) || !visible.has(player.markerId)) continue;
      const point = s.aimOnMarker(player.markerId);
      if (point) candidates.push({ userId: player.userId, marker: player.markerId, ...point });
    }
    const best = arenaAimTarget(candidates);
    const target = best ? { ...best, marker: candidates.find((c) => c.userId === best.userId)!.marker } : null;
    const ownPoint = myMarker !== null && visible.has(myMarker) ? s.aimOnMarker(myMarker) : null;
    aim.current = { target, own: ownPoint ? clampAim(ownPoint) : null };

    const elapsed = lastFrame.current > 0 ? Math.max(0, Math.min(MAX_FRAME_SECONDS, (frame.now - lastFrame.current) / 1000)) : 0;
    lastFrame.current = frame.now;
    const dt = Math.min(MAX_DT, elapsed);
    const playing = snapshot.match.status === "playing";
    replayEvents(s);
    if (playing) {
      for (let left = elapsed; left > 0; left -= MAX_DT) {
        const step = stepArenaLocal(local.current, Math.min(MAX_DT, left));
        for (const egg of step.landed) judgeLanding(s, egg);
        for (const tongue of step.caught) if (tongue.own) resolveTongue(s, tongue);
      }
    }
    for (const [marker, yaw] of yaws.current) {
      let diff = yaw.wanted - yaw.current;
      while (diff > Math.PI) diff -= TWO_PI;
      while (diff < -Math.PI) diff += TWO_PI;
      yaw.current += diff * Math.min(1, dt * YAW_SPEED);
      s.setYaw(marker, yaw.current);
    }

    const now = transport.serverNow();
    const markerOf = new Map(players.map((p) => [p.userId, p.markerId]));
    const bonuses: ArenaSceneBonus[] = [];
    for (const bonus of snapshot.bonuses) {
      const marker = markerOf.get(bonus.anchorUserId);
      if (marker === undefined || eatenLocally.current.has(bonus.id)) continue;
      const expiresAt = Date.parse(bonus.expiresAt);
      bonuses.push({ id: bonus.id, marker, x: bonus.x, y: bonus.y, kind: bonus.kind as FoodModelKind, bornAt: expiresAt - ARENA.bonusStaySeconds * 1000, expiresAt });
    }
    const scenePlayers: ArenaScenePlayer[] = players.map((p) => ({ marker: p.markerId, hp: p.hp, maxHp: snapshot.match.maxHp, mine: p.mine, standing: isStanding(p) }));
    const aimRing = target ? { marker: target.marker, x: target.x, y: target.y } : aim.current.own && myMarker !== null ? { marker: myMarker, ...aim.current.own } : null;
    sc.sync(local.current, { aim: playing ? aimRing : null, players: scenePlayers, bonuses, now, topOf: (m) => s.topOf(m) });
    s.render();

    const next: Hud = {
      status: snapshot.match.status,
      secondsLeft: playing ? arenaSecondsLeft(snapshot.match.endsAt ? Date.parse(snapshot.match.endsAt) : null, now) : 0,
      hp: me?.hp ?? 0,
      maxHp: snapshot.match.maxHp,
      standing: me ? isStanding(me) : false,
      seen: visible.size,
      mineSeen: myMarker !== null && visible.has(myMarker),
      ever: lastSeen.current.size > 0,
      target: target ? (byMarker.get(target.marker)?.username ?? null) : null,
      others: players.filter((p) => !p.mine).map((p) => ({ userId: p.userId, username: p.username, hp: p.hp, standing: isStanding(p) })),
      link: transport.linkState(),
    };
    const prev = hudRef.current;
    const othersKey = (list: OtherHud[]) => list.map((o) => `${o.userId}:${o.hp}:${o.standing}`).join("|");
    if (
      prev.status !== next.status ||
      prev.secondsLeft !== next.secondsLeft ||
      prev.hp !== next.hp ||
      prev.maxHp !== next.maxHp ||
      prev.standing !== next.standing ||
      prev.seen !== next.seen ||
      prev.mineSeen !== next.mineSeen ||
      prev.ever !== next.ever ||
      prev.target !== next.target ||
      othersKey(prev.others) !== othersKey(next.others) ||
      prev.link.mode !== next.link.mode ||
      prev.link.connected !== next.link.connected ||
      prev.link.total !== next.link.total ||
      linkKey(prev.link) !== linkKey(next.link)
    ) {
      hudRef.current = next;
      setHud(next);
    }
  }

  /** Opens the camera (before the start, or to resume after a pause). */
  async function openCamera() {
    const v = video.current;
    if (!v) return;
    setProblem(null);
    go("starting");
    const cam = new MarkerCamera(v);
    cam.onFrame = onFrame;
    camera.current = cam;
    try {
      const [started, stageMod, sceneMod] = await Promise.all([cam.start(), import("@/components/ar/three/stage"), import("@/components/ar/three/arena-scene")]);
      if (!started || camera.current !== cam) return;
      stageModule.current = stageMod;
      sceneModule.current = sceneMod;
      go("live");
    } catch (err) {
      console.error("[arena] cannot start", err);
      camera.current = null;
      setProblem(err instanceof CameraError ? err.kind : "error");
      go("intro");
    }
  }

  function fire(event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLDivElement>) {
    event?.preventDefault();
    const s = stage.current;
    const snapshot = latest.current;
    const me = snapshot.me;
    if (!s || !me || phaseRef.current !== "live" || snapshot.match.status !== "playing" || !isStanding(me)) return;
    const { target, own } = aim.current;
    const myMarker = me.markerId;
    const mineVisible = s.isVisible(myMarker);
    const nonce = randomNonce();
    if (target) {
      // Flight in the own paper's frame when it is in view (the target may dodge), else in the target's.
      const marker = mineVisible ? myMarker : target.marker;
      const to = convert(s, target.marker, marker, target.x, target.y, 0);
      if (!to) return;
      let from: Vec3;
      if (marker === myMarker) {
        const len = Math.hypot(to.x, to.y) || 1;
        from = mouthPoint(s, myMarker, { x: to.x / len, y: to.y / len });
        turnToward(myMarker, to);
      } else {
        const hand = s.localPoint(marker, CAMERA_HAND, localVec.current);
        from = hand ? { x: hand.x, y: hand.y, z: Math.max(0.3, hand.z) } : { x: to.x, y: to.y, z: 1.6 };
      }
      const egg = shootLocal(local.current, { marker, from, to, targetMarker: target.marker, targetUserId: target.userId, nonce });
      if (egg) transport.broadcast({ t: "egg", nonce, target: target.userId, x: target.x, y: target.y });
    } else if (own && mineVisible) {
      const len = Math.hypot(own.x, own.y) || 1;
      turnToward(myMarker, own);
      const egg = shootLocal(local.current, { marker: myMarker, from: mouthPoint(s, myMarker, { x: own.x / len, y: own.y / len }), to: { x: own.x, y: own.y, z: 0 }, targetMarker: null, targetUserId: null, nonce });
      if (egg) transport.broadcast({ t: "egg", nonce, target: null, x: own.x, y: own.y });
    }
  }

  function lick(event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLDivElement>) {
    event?.preventDefault();
    const s = stage.current;
    const snapshot = latest.current;
    const me = snapshot.me;
    if (!s || !me || phaseRef.current !== "live" || snapshot.match.status !== "playing" || !isStanding(me)) return;
    const myMarker = me.markerId;
    if (!s.isVisible(myMarker)) return;
    const { target, own } = aim.current;
    const point = target ? convert(s, target.marker, myMarker, target.x, target.y, 0) : own;
    if (!point) return;
    const tongue = lickLocal(local.current, myMarker, point);
    if (!tongue) return;
    tongue.nonce = randomNonce();
    turnToward(myMarker, point);
    transport.broadcast({ t: "tongue", nonce: tongue.nonce, angle: Math.atan2(tongue.dir.y, tongue.dir.x), length: tongue.length });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " " || event.key === "Enter") fire(event);
    else if (event.key === "l" || event.key === "L") lick(event);
  }

  const cameraOn = phase === "starting" || phase === "live";
  const playing = hud.status === "playing";
  const hpPercent = hud.maxHp > 0 ? Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100)) : 0;
  const minutes = Math.floor(hud.secondsLeft / 60);
  const seconds = hud.secondsLeft % 60;
  const items = participants(initial)
    .filter((p) => p.creature)
    .map((p) => ({ speciesId: p.creature!.speciesId, accessories: p.creature!.accessories }));

  return (
    <div className="space-y-3">
      <div
        role="application"
        aria-label="Zone de jeu"
        tabIndex={playing ? 0 : -1}
        onKeyDown={onKeyDown}
        className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-ink-600/80 bg-ink-950 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/70", !cameraOn && "flex items-center justify-center")}
      >
        <video ref={video} playsInline muted autoPlay className={cn("absolute inset-0 h-full w-full object-cover", !cameraOn && "hidden")} aria-label="Image de la caméra" />
        {cameraOn ? <canvas ref={glCanvas} data-arena-stage className="pointer-events-none absolute inset-0 h-full w-full object-cover" aria-hidden="true" /> : null}

        {phase === "live" ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-3 top-3 space-y-1.5"
              data-arena-hud
              data-status={hud.status}
              data-seconds={hud.secondsLeft}
              data-hp={hud.hp}
              data-seen={hud.seen}
              data-mine-seen={hud.mineSeen ? "1" : "0"}
              data-target={hud.target ?? undefined}
              data-standing={hud.standing ? "1" : "0"}
              data-link={hud.link.mode}
              data-peers={`${hud.link.connected}/${hud.link.total}`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink-950/70 px-3 py-1 text-xs font-semibold tabular-nums text-cream-50 backdrop-blur">
                  {playing ? `${minutes}:${seconds.toString().padStart(2, "0")}` : hud.status === "lobby" ? "En attente" : "Terminé"}
                </span>
                <div className="flex-1 rounded-full bg-ink-950/70 p-1 backdrop-blur" role="meter" aria-label="Tes points de vie" aria-valuemin={0} aria-valuemax={hud.maxHp} aria-valuenow={hud.hp}>
                  <div className={cn("h-2 rounded-full transition-[width] duration-300", hpPercent > 50 ? "bg-health" : hpPercent > 25 ? "bg-brass-400" : "bg-danger")} style={{ width: `${hpPercent}%` }} />
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-semibold backdrop-blur", hud.target ? "bg-brass-400/90 text-ink-950" : "bg-ink-950/70 text-cream-500")}>{hud.target ? `→ ${hud.target}` : "Vise une créature"}</span>
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label="Adversaires">
                {hud.link.mode === "webrtc" ? (
                  <li
                    className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur", hud.link.total > 0 && hud.link.connected === hud.link.total ? "bg-sage-700/70 text-sage-100" : "bg-ink-950/70 text-cream-500")}
                    title={`Liaison directe entre les téléphones (WebRTC) ; le serveur reste l'arbitre. ${hud.link.peers.map((p) => `${p.userId.slice(0, 6)} : ${p.state}${p.via ? ` via ${p.via}` : ""}`).join(" · ")}`}
                    data-link-label
                  >
                    {linkLabel(hud.link)}
                  </li>
                ) : null}
                {hud.others.map((o) => (
                  <li key={o.userId} className={cn("flex items-center gap-1.5 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] font-semibold text-cream-100 backdrop-blur", !o.standing && "line-through opacity-60")}>
                    {o.username}
                    <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-ink-700">
                      <span className="block h-full bg-danger" style={{ width: `${hud.maxHp > 0 ? (o.hp / hud.maxHp) * 100 : 0}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cream-50/85 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]">
              <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream-50" />
              <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 -translate-y-full bg-cream-50/85" />
              <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 translate-y-full bg-cream-50/85" />
              <span className="absolute left-0 top-1/2 h-px w-2 -translate-x-full -translate-y-1/2 bg-cream-50/85" />
              <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 translate-x-full bg-cream-50/85" />
            </div>
            <p className="sr-only" aria-live="polite">
              {playing ? `${hud.secondsLeft} secondes, ${hud.hp} points de vie.` : ""}
              {hud.target ? ` Tu vises ${hud.target}.` : ""}
            </p>

            {hud.status === "lobby" ? (
              <p className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-arena-notice="lobby">
                {hud.seen > 0 ? `${hud.seen} créature${hud.seen > 1 ? "s" : ""} reconnue${hud.seen > 1 ? "s" : ""}. ` : "Cadre les marqueurs posés sur la table. "}
                La bataille commence quand l&apos;hôte la lance.
              </p>
            ) : null}

            {playing ? (
              <>
                {!hud.standing ? (
                  <p className="pointer-events-none absolute inset-x-4 top-20 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-arena-notice="out">
                    Ta créature est hors jeu. Tu peux regarder la fin de la bataille.
                  </p>
                ) : hud.seen === 0 ? (
                  <p className="pointer-events-none absolute inset-x-4 top-20 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-arena-notice="lost">
                    Retrouve les marqueurs sur la table pour viser.
                  </p>
                ) : !hud.mineSeen ? (
                  <p className="pointer-events-none absolute inset-x-4 top-20 rounded-2xl bg-ink-950/60 px-4 py-2 text-center text-xs text-cream-200 backdrop-blur" data-arena-notice="mine-lost">
                    Garde ton propre marqueur dans l&apos;image pour tirer la langue.
                  </p>
                ) : null}
                <button
                  type="button"
                  onPointerDown={fire}
                  aria-label="Lancer un œuf"
                  data-arena-fire
                  disabled={!hud.standing}
                  className="absolute bottom-4 right-4 flex h-20 w-20 touch-none select-none items-center justify-center rounded-full bg-brass-400 text-ink-950 shadow-lg transition-transform active:scale-95 disabled:opacity-40"
                >
                  <Egg className="h-9 w-9" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onPointerDown={lick}
                  aria-label="Tirer la langue"
                  data-arena-tongue
                  disabled={!hud.standing}
                  className="absolute bottom-6 right-28 flex h-16 w-16 touch-none select-none flex-col items-center justify-center rounded-full bg-[#e88a9a] text-ink-950 shadow-lg transition-transform active:scale-95 disabled:opacity-40"
                >
                  <span aria-hidden="true" className="block h-6 w-3.5 rounded-b-full rounded-t-sm bg-[#b83d5a]" />
                  <span aria-hidden="true" className="text-[10px] font-bold uppercase tracking-wide">
                    Langue
                  </span>
                </button>
                {onLeave ? (
                  <button
                    type="button"
                    onClick={onLeave}
                    className="absolute bottom-4 left-4 inline-flex min-h-11 items-center rounded-full bg-ink-950/70 px-4 text-xs font-semibold text-cream-300 backdrop-blur hover:text-cream-50"
                  >
                    Abandonner
                  </button>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {phase === "intro" || phase === "starting" ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            {problem === "unsupported" ? (
              <Alert tone="warning">Ce navigateur ne donne pas accès à la caméra. Essaie avec Chrome ou Safari, en HTTPS.</Alert>
            ) : problem === "denied" ? (
              <Alert tone="warning">L&apos;accès à la caméra a été refusé. Autorise-le dans les réglages du navigateur, puis réessaie.</Alert>
            ) : problem === "error" ? (
              <Alert tone="danger">Impossible d&apos;ouvrir la caméra. Ferme les autres applications qui l&apos;utilisent et réessaie.</Alert>
            ) : problem === "nogl" ? (
              <Alert tone="warning">Ce navigateur ne sait pas afficher la 3D nécessaire au jeu. Essaie avec Chrome ou Safari récent.</Alert>
            ) : null}
            <Swords className="h-8 w-8 text-sage-300" aria-hidden="true" />
            <p className="max-w-xs text-sm leading-relaxed text-cream-100">
              {initial.match.status === "playing" || latest.current.match.status === "playing"
                ? "La bataille a commencé ! Ouvre la caméra et cadre les marqueurs posés sur la table."
                : "Posez vos marqueurs sur la même table, chacun cadre la table avec son téléphone. Vise une créature adverse avec le centre de l'écran pour lui lancer un œuf, et attrape avec la langue les fruits et légumes qui apparaissent pour regagner de la vie."}
            </p>
            <Button onClick={() => void openCamera()} disabled={phase === "starting"} className="w-auto px-8" variant="brass">
              {phase === "starting" ? "Ouverture de la caméra…" : problem ? "Réessayer" : "Lancer la caméra"}
            </Button>
          </div>
        ) : null}

        {phase === "paused" ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-cream-100">Caméra coupée quand l&apos;écran est quitté. La bataille continue sans toi tant que tu ne reviens pas.</p>
            <Button onClick={() => void openCamera()} variant="brass" className="w-auto px-6">
              Reprendre
            </Button>
          </div>
        ) : null}
      </div>

      <AccessorySprites ref={sprites} items={items} />
    </div>
  );
}
