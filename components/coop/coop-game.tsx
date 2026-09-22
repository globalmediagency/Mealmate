"use client";

import { Egg, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as THREE from "three";
import { CameraError, MarkerCamera, type CameraFrame, type Corner } from "@/components/ar/marker-camera";
import { AccessorySprites, accessoryMarkup } from "@/components/ar/three/accessory-sprites";
import type { CreatureMeshInput } from "@/components/ar/three/creature-mesh";
import type { DefenseScene } from "@/components/ar/three/defense-scene";
import type { ThreeStage } from "@/components/ar/three/stage";
import type { ArCreature } from "@/components/ar/types";
import { linkKey, linkLabel } from "@/components/arena/link-label";
import { NO_LINK, type ArenaTransport, type LinkState } from "@/components/arena/transport";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ArenaEventView, ArenaPlayerView, ArenaSnapshot } from "@/lib/arena/service";
import { NonceMemory, randomNonce } from "@/lib/arena/rtc-protocol";
import { getSpecies } from "@/lib/creatures";
import { COOP } from "@/lib/game/config";
import { advanceDefense, coopOver, coopRandom, parseCoopState, serializeDefense, type CoopStateMessage } from "@/lib/game/coop";
import {
  applyCatch,
  clampAim,
  createDefense,
  endDefense,
  fireDefense,
  smashDefense,
  startDefense,
  tongueDefense,
  yawToward,
  type DefenseState,
  type DefenseSummary,
  type Vec2,
} from "@/lib/game/defense";
import type { SeededRandom } from "@/lib/game/random";
import { cn } from "@/lib/utils/cn";

type StageModule = typeof import("@/components/ar/three/stage");
type SceneModule = typeof import("@/components/ar/three/defense-scene");
type TexturePromise = ReturnType<StageModule["textureFromSvg"]>;

type Phase = "intro" | "starting" | "live" | "paused";
type Problem = "unsupported" | "denied" | "error" | "nogl" | null;

/** One creature's simulation, in its own paper's frame. */
type Sim = {
  userId: string;
  username: string;
  name: string;
  marker: number;
  mine: boolean;
  state: DefenseState;
  random: SeededRandom;
  scene: DefenseScene | null;
  /** Smoothed yaw shown on the 3D creature. */
  yaw: number;
};

type CreatureHud = { userId: string; username: string; name: string; wave: number; hp: number; maxHp: number; over: boolean; mine: boolean };

type Hud = {
  status: ArenaSnapshot["match"]["status"];
  seen: number;
  mineSeen: boolean;
  ever: boolean;
  target: string | null;
  link: LinkState;
  creatures: CreatureHud[];
  score: number;
  /** Guest: no news from the host for a while. */
  hostSilent: boolean;
  allOver: boolean;
};

export type CoopGameProps = {
  transport: ArenaTransport;
  initial: ArenaSnapshot;
  preview?: boolean;
  onLeave?: () => void;
};

/** The marker may flicker: its last pose is kept this long before the creature disappears. */
const HOLD_MS = 1200;
/** Longest simulated sub-step: a slow frame is simulated in several steps, so nothing tunnels through a creature. */
const MAX_DT = 0.05;
/** A frame longer than this (tab hidden, phone busy) is not caught up: the game simply pauses for the rest. */
const MAX_FRAME_SECONDS = 0.5;
/** How fast a creature turns toward its last shot (radians per second, proportional). */
const YAW_SPEED = 10;
const TWO_PI = Math.PI * 2;
/** Latency assumed for a state that came over the direct link. */
const PEER_LATENCY_SECONDS = 0.08;

const IDLE_HUD: Hud = { status: "lobby", seen: 0, mineSeen: false, ever: false, target: null, link: NO_LINK, creatures: [], score: 0, hostSilent: false, allOver: false };

const participants = (snapshot: ArenaSnapshot): ArenaPlayerView[] => snapshot.players.filter((p) => p.status === "ready");

/**
 * "Défendre à deux" (spec § 3.23): the junk attacks every creature of the
 * match, each on its own paper, and every player shoots at any of them. Each
 * phone runs the same seeded simulation per creature (`lib/game/defense.ts`);
 * the host's copy is the truth, published over the direct link and to the
 * server, and the guests resync to it. Partners' eggs and tongues are drawn
 * as cosmetic copies; what they hit or took is reported and applied.
 */
export function CoopGame({ transport, initial, preview = false, onLeave }: CoopGameProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [problem, setProblem] = useState<Problem>(null);
  const [hud, setHud] = useState<Hud>(IDLE_HUD);
  const [ending, setEnding] = useState(false);
  const phaseRef = useRef<Phase>("intro");
  const hudRef = useRef<Hud>(IDLE_HUD);
  const latest = useRef<ArenaSnapshot>(initial);
  const pendingEvents = useRef<ArenaEventView[]>([]);
  const nonces = useRef(new NonceMemory(512));
  const sims = useRef(new Map<string, Sim>());
  const simsStarted = useRef(false);
  const lastHostTime = useRef(0);
  const lastLiveAt = useRef<string | null>(null);
  const hostSeenAt = useRef(0);
  const lastBroadcast = useRef(0);
  const lastStore = useRef(0);
  const finishing = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const sprites = useRef<HTMLDivElement>(null);
  const camera = useRef<MarkerCamera | null>(null);
  const stage = useRef<ThreeStage | null>(null);
  const stageModule = useRef<StageModule | null>(null);
  const sceneModule = useRef<SceneModule | null>(null);
  const textures = useRef(new Map<string, TexturePromise>());
  const aim = useRef<{ target: Sim | null; point: Vec2 | null }>({ target: null, point: null });
  const lastSeen = useRef(new Map<number, number>());
  const lastFrame = useRef(0);
  const world = useRef(new THREE.Vector3());
  const localVec = useRef(new THREE.Vector3());
  const me = initial.me?.userId ?? "";
  const isHost = initial.match.hostId === me;

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  /** Creates the creatures' simulations once (host first, same order on every phone) and starts them. */
  function ensureSims(snapshot: ArenaSnapshot) {
    if (simsStarted.current) return;
    const players = participants(snapshot);
    if (players.length === 0) return;
    sims.current.clear();
    players.forEach((p, index) => {
      const state = createDefense(snapshot.match.defense);
      startDefense(state);
      sims.current.set(p.userId, { userId: p.userId, username: p.username, name: p.creatureName ?? p.creature?.name ?? "sa créature", marker: p.markerId, mine: p.userId === me, state, random: coopRandom(snapshot.match.seed, index), scene: null, yaw: 0 });
    });
    simsStarted.current = true;
  }

  /** A guest adopts the host's simulations, keeping its own eggs and tongue in flight, and catches up on the delay. */
  const adoptHostState = useCallback(
    (message: CoopStateMessage, latencySeconds: number) => {
      if (isHost || message.hostTime <= lastHostTime.current) return;
      lastHostTime.current = message.hostTime;
      hostSeenAt.current = Date.now();
      for (const [userId, entry] of Object.entries(message.states)) {
        const sim = sims.current.get(userId);
        if (!sim) continue;
        const prev = sim.state;
        const next: DefenseState = { ...entry.state, recentSmashes: [], recentCatches: [] };
        next.eggs = [...next.eggs.map((e) => ({ ...e, cosmetic: true })), ...prev.eggs.filter((e) => !e.cosmetic)];
        next.tongue = prev.tongue && !prev.tongue.cosmetic ? prev.tongue : next.tongue ? { ...next.tongue, cosmetic: true, caught: true } : null;
        next.lastFireAt = prev.lastFireAt;
        next.lastTongueAt = prev.lastTongueAt;
        if (sim.mine) next.yaw = prev.yaw;
        sim.random.restore(entry.rng);
        advanceDefense(next, sim.random.next, latencySeconds);
        sim.state = next;
      }
    },
    [isHost],
  );

  useEffect(() => {
    latest.current = transport.snapshot ?? initial;
    const offSnapshots = transport.subscribe((snapshot) => {
      latest.current = snapshot;
      if (snapshot.events.length > 0) pendingEvents.current.push(...snapshot.events);
      const live = snapshot.match.coop?.live;
      const liveAt = snapshot.match.coop?.liveAt ?? null;
      if (live && liveAt && liveAt !== lastLiveAt.current) {
        lastLiveAt.current = liveAt;
        const latency = Math.max(0, (transport.serverNow() - Date.parse(liveAt)) / 1000);
        adoptHostState(live, latency);
      }
    });
    const offPeers = transport.subscribePeers((event) => {
      if (event.kind === "state") {
        const parsed = parseCoopState(event.payload);
        if (parsed) adoptHostState(parsed, PEER_LATENCY_SECONDS);
        return;
      }
      pendingEvents.current.push(event);
    });
    return () => {
      offSnapshots();
      offPeers();
    };
  }, [transport, initial, adoptHostState]);

  const teardown = useCallback(() => {
    camera.current?.stop();
    camera.current = null;
    for (const sim of sims.current.values()) {
      sim.scene?.dispose();
      sim.scene = null;
    }
    stage.current?.dispose();
    stage.current = null;
    for (const promise of textures.current.values()) void promise.then((t) => t?.dispose());
    textures.current.clear();
    aim.current = { target: null, point: null };
    lastSeen.current.clear();
    lastFrame.current = 0;
    hudRef.current = IDLE_HUD;
  }, []);

  useEffect(() => teardown, [teardown]);

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

  function ensureStage(videoWidth: number, videoHeight: number): ThreeStage | null {
    if (stage.current) {
      stage.current.resize(videoWidth, videoHeight);
      return stage.current;
    }
    const canvas = glCanvas.current;
    const stageMod = stageModule.current;
    if (!canvas || !stageMod || !sceneModule.current) return null;
    try {
      const created = new stageMod.ThreeStage(canvas, videoWidth, videoHeight);
      stage.current = created;
      if (preview) (window as unknown as { __coopSims?: unknown }).__coopSims = sims.current;
      return created;
    } catch (err) {
      console.warn("[coop] WebGL unavailable", err);
      teardown();
      setProblem("nogl");
      go("intro");
      return null;
    }
  }

  function convert(s: ThreeStage, from: number, to: number, x: number, y: number, z: number): { x: number; y: number; z: number } | null {
    if (from === to) return { x, y, z };
    const w = s.worldPoint(from, x, y, z, world.current);
    if (!w) return null;
    const l = s.localPoint(to, w, localVec.current);
    return l ? { x: l.x, y: l.y, z: l.z } : null;
  }

  /** Whether the server relay is needed for a move (no direct link to everybody). */
  function relayNeeded(): boolean {
    const link = transport.linkState();
    return link.mode !== "webrtc" || link.connected < link.total;
  }

  /** Replays partners' moves: cosmetic eggs and tongues, and what they hit or took. */
  function replayEvents(s: ThreeStage) {
    const events = pendingEvents.current;
    pendingEvents.current = [];
    for (const event of events) {
      if (!event.actorId || event.actorId === me) continue;
      const payload = event.payload as Record<string, unknown>;
      const nonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
      const frame = typeof payload.frame === "string" ? sims.current.get(payload.frame) : undefined;
      const actor = sims.current.get(event.actorId);
      if (!frame) continue;
      if (event.kind === "fire") {
        if (!nonces.current.add(nonce ? `fire:${nonce}` : undefined)) continue;
        const x = typeof payload.x === "number" ? payload.x : 0;
        const y = typeof payload.y === "number" ? payload.y : 0;
        const f = payload.from as { x: number; y: number; z: number } | null | undefined;
        fireDefense(frame.state, { x, y }, { cosmetic: true, from: f && typeof f === "object" ? f : undefined });
        if (actor && actor.userId === frame.userId) actor.state.yaw = yawToward(clampAim({ x, y }));
        else if (actor && s.isTracked(actor.marker) && s.isTracked(frame.marker)) {
          const towards = convert(s, frame.marker, actor.marker, x, y, 0);
          if (towards) actor.state.yaw = yawToward(towards);
        }
      } else if (event.kind === "smash") {
        if (!nonces.current.add(nonce ? `smash:${nonce}` : undefined)) continue;
        const hits = Array.isArray(payload.hits) ? (payload.hits as number[]) : [];
        smashDefense(frame.state, { hits, x: typeof payload.x === "number" ? payload.x : 0, y: typeof payload.y === "number" ? payload.y : 0 });
      } else if (event.kind === "lick") {
        if (!nonces.current.add(nonce ? `lick:${nonce}` : undefined)) continue;
        const angle = typeof payload.angle === "number" ? payload.angle : 0;
        const length = typeof payload.length === "number" ? payload.length : 1.2;
        tongueDefense(frame.state, { x: Math.cos(angle) * length, y: Math.sin(angle) * length }, { cosmetic: true });
      } else if (event.kind === "catch") {
        if (!nonces.current.add(nonce ? `catch:${nonce}` : undefined)) continue;
        applyCatch(frame.state, { bonusIds: Array.isArray(payload.bonusIds) ? (payload.bonusIds as number[]) : [], junkIds: Array.isArray(payload.junkIds) ? (payload.junkIds as number[]) : [] });
      }
    }
  }

  /** The host publishes its simulations: over the direct link often, to the server a bit less. */
  function publish(now: number) {
    if (!isHost) return;
    const message = (): CoopStateMessage => ({
      hostTime: Date.now(),
      states: Object.fromEntries([...sims.current.values()].map((sim) => [sim.userId, { state: serializeDefense(sim.state), rng: sim.random.state() }])),
    });
    if (now - lastBroadcast.current >= COOP.broadcastMs) {
      lastBroadcast.current = now;
      const link = transport.linkState();
      if (link.connected > 0) transport.broadcast({ t: "state", nonce: randomNonce(), ...message() });
    }
    if (now - lastStore.current >= COOP.storeMs) {
      lastStore.current = now;
      void transport.coop({ action: "state", state: message() });
    }
  }

  /** Reports this phone's own landings and catches to the partners (and the host applies them for real). */
  function report() {
    for (const sim of sims.current.values()) {
      for (const smash of sim.state.recentSmashes) {
        const nonce = randomNonce();
        transport.broadcast({ t: "smash", nonce, frame: sim.userId, hits: smash.hits, x: smash.x, y: smash.y });
        if (!isHost && relayNeeded()) void transport.coop({ action: "smash", frame: sim.userId, hits: smash.hits, x: smash.x, y: smash.y, nonce });
      }
      sim.state.recentSmashes.length = 0;
      for (const taken of sim.state.recentCatches) {
        const nonce = randomNonce();
        transport.broadcast({ t: "catch", nonce, frame: sim.userId, bonusIds: taken.bonusIds, junkIds: taken.junkIds });
        if (!isHost && relayNeeded()) void transport.coop({ action: "catch", frame: sim.userId, bonusIds: taken.bonusIds, junkIds: taken.junkIds, nonce });
      }
      sim.state.recentCatches.length = 0;
    }
  }

  /** Ends the battle for everybody with each creature's summary (the referee scores the team). */
  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setEnding(true);
    for (const sim of sims.current.values()) endDefense(sim.state);
    const summaries: Record<string, DefenseSummary> = {};
    for (const sim of sims.current.values()) summaries[sim.userId] = { ...sim.state.summary };
    const ok = await transport.coop({ action: "finish", summaries });
    if (!ok) {
      finishing.current = false;
      setEnding(false);
    }
  }

  function onFrame(frame: CameraFrame) {
    const s = ensureStage(frame.videoWidth, frame.videoHeight);
    const sceneMod = sceneModule.current;
    if (!s || !sceneMod) return;
    const snapshot = latest.current;
    const playing = snapshot.match.status === "playing";
    if (playing) ensureSims(snapshot);
    const byMarker = new Map<number, ArenaPlayerView>(snapshot.players.filter((p) => p.status === "ready").map((p) => [p.markerId, p]));

    const detections = new Map<number, Corner[]>();
    for (const found of frame.markers) {
      const player = byMarker.get(found.id);
      if (!player?.creature) continue;
      if (!s.isTracked(found.id)) {
        const input = meshInput(player.creature);
        if (!input) continue;
        s.ensureTarget(found.id, input);
      }
      const sim = sims.current.get(player.userId);
      if (sim && !sim.scene) {
        sim.scene = new sceneMod.DefenseScene();
        s.attach(found.id, sim.scene.root);
        sim.scene.setMouth(s.mouthOf(found.id));
      }
      detections.set(found.id, found.corners);
      lastSeen.current.set(found.id, frame.now);
    }
    const visible = new Set<number>();
    const holdFor = Math.max(HOLD_MS, 3 * frame.period);
    for (const [id, at] of lastSeen.current) if (frame.now - at < holdFor) visible.add(id);
    s.update(detections, visible);

    // Aim: the creature whose paper the crosshair points at, nearest to its centre.
    let target: Sim | null = null;
    let point: Vec2 | null = null;
    let best = Infinity;
    for (const sim of sims.current.values()) {
      if (!visible.has(sim.marker)) continue;
      const p = s.aimOnMarker(sim.marker);
      if (!p) continue;
      const d = Math.hypot(p.x, p.y);
      if (d < best && d <= COOP.aimMaxRadius) {
        best = d;
        target = sim;
        point = clampAim(p);
      }
    }
    aim.current = { target, point };

    const elapsed = lastFrame.current > 0 ? Math.max(0, Math.min(MAX_FRAME_SECONDS, (frame.now - lastFrame.current) / 1000)) : 0;
    lastFrame.current = frame.now;
    const dt = Math.min(MAX_DT, elapsed);
    if (playing && phaseRef.current === "live") {
      replayEvents(s);
      for (const sim of sims.current.values()) advanceDefense(sim.state, sim.random.next, elapsed, MAX_DT);
      report();
      publish(frame.now);
    }
    for (const sim of sims.current.values()) {
      let diff = sim.state.yaw - sim.yaw;
      while (diff > Math.PI) diff -= TWO_PI;
      while (diff < -Math.PI) diff += TWO_PI;
      sim.yaw += diff * Math.min(1, dt * YAW_SPEED);
      s.setYaw(sim.marker, sim.yaw);
      sim.scene?.sync(playing ? sim.state : null, playing && target === sim ? point : null);
    }
    s.render();

    const allOver = playing && simsStarted.current && coopOver([...sims.current.values()].map((sim) => sim.state));
    if (allOver && (isHost || preview) && !finishing.current) void finish();
    const next: Hud = {
      status: snapshot.match.status,
      seen: visible.size,
      mineSeen: sims.current.get(me) ? visible.has(sims.current.get(me)!.marker) : false,
      ever: lastSeen.current.size > 0,
      target: target ? (target.mine ? "toi" : target.username) : null,
      link: transport.linkState(),
      creatures: [...sims.current.values()].map((sim) => ({ userId: sim.userId, username: sim.username, name: sim.name, wave: sim.state.wave, hp: Math.round(sim.state.hp), maxHp: sim.state.rules.hp, over: sim.state.status === "over", mine: sim.mine })),
      score: [...sims.current.values()].reduce((sum, sim) => sum + sim.state.score, 0),
      hostSilent: !isHost && playing && hostSeenAt.current > 0 && Date.now() - hostSeenAt.current > COOP.hostSilenceMs,
      allOver,
    };
    const prev = hudRef.current;
    const creaturesKey = (list: CreatureHud[]) => list.map((c) => `${c.userId}:${c.wave}:${c.hp}:${c.over}`).join("|");
    if (
      prev.status !== next.status ||
      prev.seen !== next.seen ||
      prev.mineSeen !== next.mineSeen ||
      prev.ever !== next.ever ||
      prev.target !== next.target ||
      prev.score !== next.score ||
      prev.hostSilent !== next.hostSilent ||
      prev.allOver !== next.allOver ||
      creaturesKey(prev.creatures) !== creaturesKey(next.creatures) ||
      prev.link.mode !== next.link.mode ||
      prev.link.connected !== next.link.connected ||
      prev.link.total !== next.link.total ||
      linkKey(prev.link) !== linkKey(next.link)
    ) {
      hudRef.current = next;
      setHud(next);
    }
  }

  async function openCamera() {
    const v = video.current;
    if (!v) return;
    setProblem(null);
    go("starting");
    // Players who use a photo marker (spec § 3.19): their picture is recognised as their number.
    const references = latest.current.players.flatMap((p) => (p.markerImage ? [{ id: p.markerId, url: p.markerImage }] : []));
    const cam = new MarkerCamera(v, references);
    cam.onFrame = onFrame;
    camera.current = cam;
    try {
      const [started, stageMod, sceneMod] = await Promise.all([cam.start(), import("@/components/ar/three/stage"), import("@/components/ar/three/defense-scene")]);
      if (!started || camera.current !== cam) return;
      stageModule.current = stageMod;
      sceneModule.current = sceneMod;
      go("live");
    } catch (err) {
      console.error("[coop] cannot start", err);
      camera.current = null;
      setProblem(err instanceof CameraError ? err.kind : "error");
      go("intro");
    }
  }

  function fire(event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLDivElement>) {
    event?.preventDefault();
    const s = stage.current;
    const { target, point } = aim.current;
    const mine = sims.current.get(me);
    if (!s || !target || !point || !mine || phaseRef.current !== "live" || latest.current.match.status !== "playing") return;
    let from: { x: number; y: number; z: number } | undefined;
    if (target !== mine && s.isVisible(mine.marker)) {
      const mouth = s.mouthOf(mine.marker) ?? { height: 0.8, front: 0.4 };
      const towards = convert(s, target.marker, mine.marker, point.x, point.y, 0);
      if (towards) {
        const len = Math.hypot(towards.x, towards.y) || 1;
        mine.state.yaw = yawToward(towards);
        from = convert(s, mine.marker, target.marker, (towards.x / len) * mouth.front, (towards.y / len) * mouth.front, mouth.height) ?? undefined;
      }
    }
    if (!fireDefense(target.state, point, { from })) return;
    const nonce = randomNonce();
    const payload = { frame: target.userId, x: point.x, y: point.y, from: from ?? null, nonce };
    transport.broadcast({ t: "fire", ...payload });
    if (relayNeeded()) void transport.coop({ action: "fire", ...payload });
  }

  function lick(event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLDivElement>) {
    event?.preventDefault();
    const s = stage.current;
    const { target, point } = aim.current;
    const mine = sims.current.get(me);
    if (!s || !mine || !point || !target || phaseRef.current !== "live" || latest.current.match.status !== "playing" || !s.isVisible(mine.marker)) return;
    const own = target === mine ? point : convert(s, target.marker, mine.marker, point.x, point.y, 0);
    if (!own) return;
    if (!tongueDefense(mine.state, own)) return;
    const tongue = mine.state.tongue!;
    const nonce = randomNonce();
    const payload = { frame: me, angle: Math.atan2(tongue.dir.y, tongue.dir.x), length: tongue.length, nonce };
    transport.broadcast({ t: "lick", ...payload });
    if (relayNeeded()) void transport.coop({ action: "lick", ...payload });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " " || event.key === "Enter") fire(event);
    else if (event.key === "l" || event.key === "L") lick(event);
  }

  const cameraOn = phase === "starting" || phase === "live";
  const playing = hud.status === "playing";
  const items = participants(initial)
    .filter((p) => p.creature)
    .map((p) => ({ speciesId: p.creature!.speciesId, accessories: p.creature!.accessories }));
  const mineOver = hud.creatures.find((c) => c.mine)?.over ?? false;

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
        {cameraOn ? <canvas ref={glCanvas} data-coop-stage className="pointer-events-none absolute inset-0 h-full w-full object-cover" aria-hidden="true" /> : null}

        {phase === "live" ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-3 top-3 space-y-1.5"
              data-coop-hud
              data-status={hud.status}
              data-seen={hud.seen}
              data-score={hud.score}
              data-target={hud.target ?? undefined}
              data-link={hud.link.mode}
              data-peers={`${hud.link.connected}/${hud.link.total}`}
              data-creatures={hud.creatures.map((c) => `${c.name}:${c.wave}:${c.hp}`).join("|")}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink-950/70 px-3 py-1 text-xs font-semibold tabular-nums text-brass-200 backdrop-blur">{hud.score} pts</span>
                <span className={cn("ml-auto rounded-full px-3 py-1 text-xs font-semibold backdrop-blur", hud.target ? "bg-brass-400/90 text-ink-950" : "bg-ink-950/70 text-cream-500")}>
                  {hud.target ? `→ chez ${hud.target}` : "Vise une créature"}
                </span>
              </div>
              <ul className="space-y-1" aria-label="Créatures défendues">
                {hud.creatures.map((c) => (
                  <li key={c.userId} className={cn("flex items-center gap-2 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] font-semibold text-cream-100 backdrop-blur", c.over && "opacity-60")}>
                    <span className="truncate">
                      {c.name}
                      {c.mine ? "" : ` (${c.username})`}
                    </span>
                    <span className="shrink-0 text-cream-500">{c.over ? "K.-O." : c.wave > 0 ? `V${c.wave}` : ""}</span>
                    <span className="ml-auto inline-block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink-700" role="meter" aria-label={`Points de vie de ${c.name}`} aria-valuemin={0} aria-valuemax={c.maxHp} aria-valuenow={c.hp}>
                      <span className={cn("block h-full", c.hp / Math.max(1, c.maxHp) > 0.5 ? "bg-health" : c.hp / Math.max(1, c.maxHp) > 0.25 ? "bg-brass-400" : "bg-danger")} style={{ width: `${c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0}%` }} />
                    </span>
                  </li>
                ))}
                {hud.link.mode === "webrtc" ? (
                  <li className={cn("inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur", hud.link.total > 0 && hud.link.connected === hud.link.total ? "bg-sage-700/70 text-sage-100" : "bg-ink-950/70 text-cream-500")} data-link-label>
                    {linkLabel(hud.link)}
                  </li>
                ) : null}
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
              {hud.creatures.map((c) => `${c.name} : vague ${c.wave}, ${c.hp} points de vie.`).join(" ")}
            </p>

            {hud.status === "lobby" ? (
              <p className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-coop-notice="lobby">
                {hud.seen > 0 ? `${hud.seen} créature${hud.seen > 1 ? "s" : ""} reconnue${hud.seen > 1 ? "s" : ""}. ` : "Cadre les marqueurs posés sur la table (imprimés ou photos). "}
                La malbouffe arrive quand l&apos;hôte lance la partie.
              </p>
            ) : null}

            {playing ? (
              <>
                {hud.seen === 0 ? (
                  <p className="pointer-events-none absolute inset-x-4 top-24 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-coop-notice="lost">
                    Retrouve les marqueurs sur la table pour viser.
                  </p>
                ) : hud.hostSilent ? (
                  <div className="absolute inset-x-4 top-24 flex flex-col items-center gap-2 rounded-2xl bg-ink-950/80 px-4 py-3 text-center text-sm text-cream-100 backdrop-blur" data-coop-notice="host-silent">
                    Plus de nouvelles de l&apos;hôte depuis un moment. Tu peux terminer la partie avec le bilan de ton téléphone.
                    <Button onClick={() => void finish()} disabled={ending} variant="secondary" className="w-auto px-5">
                      Terminer la partie
                    </Button>
                  </div>
                ) : mineOver ? (
                  <p className="pointer-events-none absolute inset-x-4 top-24 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-coop-notice="out">
                    Ta créature est K.-O. : continue à protéger les autres !
                  </p>
                ) : !hud.mineSeen ? (
                  <p className="pointer-events-none absolute inset-x-4 top-24 rounded-2xl bg-ink-950/60 px-4 py-2 text-center text-xs text-cream-200 backdrop-blur" data-coop-notice="mine-lost">
                    Garde ton propre marqueur dans l&apos;image pour tirer la langue.
                  </p>
                ) : null}
                <button
                  type="button"
                  onPointerDown={fire}
                  aria-label="Lancer un œuf"
                  data-coop-fire
                  className="absolute bottom-4 right-4 flex h-20 w-20 touch-none select-none items-center justify-center rounded-full bg-brass-400 text-ink-950 shadow-lg transition-transform active:scale-95"
                >
                  <Egg className="h-9 w-9" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onPointerDown={lick}
                  aria-label="Tirer la langue"
                  data-coop-tongue
                  disabled={mineOver}
                  className="absolute bottom-6 right-28 flex h-16 w-16 touch-none select-none flex-col items-center justify-center rounded-full bg-[#e88a9a] text-ink-950 shadow-lg transition-transform active:scale-95 disabled:opacity-40"
                >
                  <span aria-hidden="true" className="block h-6 w-3.5 rounded-b-full rounded-t-sm bg-[#b83d5a]" />
                  <span aria-hidden="true" className="text-[10px] font-bold uppercase tracking-wide">
                    Langue
                  </span>
                </button>
                {isHost ? (
                  <button
                    type="button"
                    onClick={() => void finish()}
                    disabled={ending}
                    className="absolute bottom-4 left-4 inline-flex min-h-11 items-center rounded-full bg-ink-950/70 px-4 text-xs font-semibold text-cream-300 backdrop-blur hover:text-cream-50"
                  >
                    {ending ? "Bilan…" : "Terminer"}
                  </button>
                ) : onLeave ? (
                  <button
                    type="button"
                    onClick={onLeave}
                    className="absolute bottom-4 left-4 inline-flex min-h-11 items-center rounded-full bg-ink-950/70 px-4 text-xs font-semibold text-cream-300 backdrop-blur hover:text-cream-50"
                  >
                    Quitter
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
            <Shield className="h-8 w-8 text-sage-300" aria-hidden="true" />
            <p className="max-w-xs text-sm leading-relaxed text-cream-100">
              {latest.current.match.status === "playing"
                ? "La malbouffe attaque déjà ! Ouvre la caméra et cadre les marqueurs posés sur la table."
                : "Posez vos marqueurs côte à côte sur la même table. La malbouffe fonce sur chaque créature : vise n'importe laquelle avec le centre de l'écran et lance des œufs pour la protéger, la langue attrape les bons aliments près de la tienne. La partie dure tant qu'une créature tient debout."}
            </p>
            <Button onClick={() => void openCamera()} disabled={phase === "starting"} className="w-auto px-8" variant="brass">
              {phase === "starting" ? "Ouverture de la caméra…" : problem ? "Réessayer" : "Lancer la caméra"}
            </Button>
          </div>
        ) : null}

        {phase === "paused" ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-cream-100">Caméra coupée quand l&apos;écran est quitté. {isHost ? "La partie attend ton retour." : "La partie continue sans toi tant que tu ne reviens pas."}</p>
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
