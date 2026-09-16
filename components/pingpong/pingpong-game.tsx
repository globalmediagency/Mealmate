"use client";

import { CircleDot } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as THREE from "three";
import { CameraError, MarkerCamera, type CameraFrame, type Corner } from "@/components/ar/marker-camera";
import { AccessorySprites, accessoryMarkup } from "@/components/ar/three/accessory-sprites";
import type { CreatureMeshInput } from "@/components/ar/three/creature-mesh";
import type { PingPongScene } from "@/components/ar/three/pingpong-scene";
import type { ThreeStage } from "@/components/ar/three/stage";
import type { ArCreature } from "@/components/ar/types";
import { linkKey, linkLabel } from "@/components/arena/link-label";
import { NO_LINK, type ArenaTransport, type LinkState } from "@/components/arena/transport";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ArenaEventView, ArenaPlayerView, ArenaSnapshot } from "@/lib/arena/service";
import { NonceMemory, randomNonce } from "@/lib/arena/rtc-protocol";
import { getSpecies } from "@/lib/creatures";
import { PINGPONG } from "@/lib/game/config";
import { yawToward } from "@/lib/game/defense";
import {
  concedePingPong,
  createPingPong,
  endPingPong,
  hitPingPong,
  parsePingPongState,
  serializePingPong,
  servePingPong,
  tickPingPong,
  type HitQuality,
  type PingPongState,
  type PingPongStateMessage,
} from "@/lib/game/pingpong";
import { cn } from "@/lib/utils/cn";

type StageModule = typeof import("@/components/ar/three/stage");
type SceneModule = typeof import("@/components/ar/three/pingpong-scene");
type TexturePromise = ReturnType<StageModule["textureFromSvg"]>;

type Phase = "intro" | "starting" | "live" | "paused";
type Problem = "unsupported" | "denied" | "error" | "nogl" | null;

type Feedback = { text: string; tone: "good" | "perfect" | "bad" | "info"; at: number } | null;

type Hud = {
  status: ArenaSnapshot["match"]["status"];
  seen: number;
  ever: boolean;
  link: LinkState;
  phase: PingPongState["phase"] | "waiting";
  mine: number;
  theirs: number;
  otherName: string;
  /** What the player should do now. */
  prompt: string;
  /** The ball is coming to the player (the button is armed). */
  incoming: boolean;
  /** The player serves. */
  serving: boolean;
  rally: number;
  secondsLeft: number;
  feedback: Feedback;
  hostSilent: boolean;
  over: boolean;
};

export type PingPongGameProps = {
  transport: ArenaTransport;
  initial: ArenaSnapshot;
  preview?: boolean;
  onLeave?: () => void;
};

const HOLD_MS = 1200;
const YAW_SPEED = 8;
const TWO_PI = Math.PI * 2;
const FEEDBACK_MS = 1100;
/** Reports older than this (or in the future) are not trusted. */
const REPORT_MAX_AGE_MS = 6000;
const REPORT_MAX_AHEAD_MS = 500;
/** Preview: Léa returns the ball this often, and serves after this delay. */
const PREVIEW_RETURN_RATE = 0.72;
const PREVIEW_SERVE_DELAY_MS = 900;

const IDLE_HUD: Hud = { status: "lobby", seen: 0, ever: false, link: NO_LINK, phase: "waiting", mine: 0, theirs: 0, otherName: "", prompt: "", incoming: false, serving: false, rally: 0, secondsLeft: 0, feedback: null, hostSilent: false, over: false };

const participants = (snapshot: ArenaSnapshot): ArenaPlayerView[] => snapshot.players.filter((p) => p.status === "ready");

const QUALITY_TEXT: Record<HitQuality, string> = { perfect: "Parfait !", good: "Bien joué" };

/**
 * "Ping-pong" (spec § 3.25): the two creatures on their papers send a ball
 * back and forth; each player hits when the ball reaches their creature.
 * Every phone runs the same pure state (`lib/game/pingpong.ts`); the host's
 * copy is the truth, published over the direct link and to the server, and
 * the guest predicts its own hits until the host confirms them.
 */
export function PingPongGame({ transport, initial, preview = false, onLeave }: PingPongGameProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [problem, setProblem] = useState<Problem>(null);
  const [hud, setHud] = useState<Hud>(IDLE_HUD);
  const [ending, setEnding] = useState(false);
  const phaseRef = useRef<Phase>("intro");
  const hudRef = useRef<Hud>(IDLE_HUD);
  const latest = useRef<ArenaSnapshot>(initial);
  const pendingEvents = useRef<ArenaEventView[]>([]);
  const nonces = useRef(new NonceMemory(512));
  const state = useRef<PingPongState | null>(null);
  const markers = useRef<Record<string, number>>({});
  const names = useRef<Record<string, string>>({});
  const lastHostTime = useRef(0);
  const lastLiveAt = useRef<string | null>(null);
  const hostSeenAt = useRef(0);
  const localAheadSince = useRef(0);
  const lastBroadcast = useRef(0);
  const lastStore = useRef(0);
  const finishing = useRef(false);
  const feedback = useRef<Feedback>(null);
  const yaws = useRef<Record<string, number>>({});
  const previewServeAt = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const sprites = useRef<HTMLDivElement>(null);
  const camera = useRef<MarkerCamera | null>(null);
  const stage = useRef<ThreeStage | null>(null);
  const scene = useRef<PingPongScene | null>(null);
  const stageModule = useRef<StageModule | null>(null);
  const sceneModule = useRef<SceneModule | null>(null);
  const textures = useRef(new Map<string, TexturePromise>());
  const lastSeen = useRef(new Map<number, number>());
  const lastFrame = useRef(0);
  const scratch = useRef(new THREE.Vector3());
  const scratch2 = useRef(new THREE.Vector3());
  const me = initial.me?.userId ?? "";
  const isHost = initial.match.hostId === me;

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  /** Creates the shared state once the match is playing (the host first, same order on every phone). */
  function ensureState(snapshot: ArenaSnapshot): PingPongState | null {
    if (state.current) return state.current;
    const players = participants(snapshot);
    if (players.length < 2 || snapshot.match.status !== "playing") return null;
    const host = players.find((p) => p.isHost) ?? players[0];
    const guest = players.find((p) => p.userId !== host.userId)!;
    for (const p of players) {
      markers.current[p.userId] = p.markerId;
      names.current[p.userId] = p.mine ? "toi" : p.username;
    }
    const startedAt = snapshot.match.startedAt ? Date.parse(snapshot.match.startedAt) : transport.serverNow();
    const endsAt = snapshot.match.endsAt ? Date.parse(snapshot.match.endsAt) : startedAt + PINGPONG.maxSeconds * 1000;
    state.current = createPingPong([host.userId, guest.userId], startedAt, endsAt);
    if (preview) (window as unknown as { __pingpong?: unknown }).__pingpong = { state: state.current, me };
    return state.current;
  }

  /** A guest adopts the host's state, unless its own move is still ahead of what the host has seen. */
  const adoptHostState = useCallback(
    (message: PingPongStateMessage) => {
      if (isHost || message.hostTime <= lastHostTime.current) return;
      lastHostTime.current = message.hostTime;
      hostSeenAt.current = Date.now();
      const local = state.current;
      if (local && local.seq > message.state.seq && Date.now() - localAheadSince.current < PINGPONG.maxPredictionMs) return;
      const incoming = { ...message.state, recent: [] as PingPongState["recent"] };
      if (local) {
        // Show what changed on the host's side as effects (a point, a hit of the other player).
        if (incoming.rallies > local.rallies && incoming.lastPoint) incoming.recent.push({ kind: "point", player: incoming.lastPoint.to, reason: incoming.lastPoint.reason, at: incoming.lastPoint.at });
      }
      state.current = incoming;
      if (preview) (window as unknown as { __pingpong?: unknown }).__pingpong = { state: incoming, me };
    },
    [isHost, preview, me],
  );

  useEffect(() => {
    latest.current = transport.snapshot ?? initial;
    const offSnapshots = transport.subscribe((snapshot) => {
      latest.current = snapshot;
      if (snapshot.events.length > 0) pendingEvents.current.push(...snapshot.events);
      const live = snapshot.match.pingpong?.live;
      const liveAt = snapshot.match.pingpong?.liveAt ?? null;
      if (live && liveAt && liveAt !== lastLiveAt.current) {
        lastLiveAt.current = liveAt;
        adoptHostState(live);
      }
    });
    const offPeers = transport.subscribePeers((event) => {
      if (event.kind === "ppstate") {
        const parsed = parsePingPongState(event.payload);
        if (parsed) adoptHostState(parsed);
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
    scene.current?.dispose();
    scene.current = null;
    stage.current?.dispose();
    stage.current = null;
    for (const promise of textures.current.values()) void promise.then((t) => t?.dispose());
    textures.current.clear();
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
    };
  }

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
      const sc = new sceneMod.PingPongScene();
      created.attachWorld(sc.root);
      scene.current = sc;
      if (preview) (window as unknown as { __pingpongScene?: unknown; __pingpongStage?: unknown }).__pingpongScene = sc;
      if (preview) (window as unknown as { __pingpongStage?: unknown }).__pingpongStage = created;
      return created;
    } catch (err) {
      console.warn("[pingpong] WebGL unavailable", err);
      teardown();
      setProblem("nogl");
      go("intro");
      return null;
    }
  }

  /** Whether the server relay is needed for a move (no direct link to the other phone). */
  function relayNeeded(): boolean {
    const link = transport.linkState();
    return link.mode !== "webrtc" || link.connected < link.total;
  }

  function show(text: string, tone: NonNullable<Feedback>["tone"]) {
    feedback.current = { text, tone, at: Date.now() };
  }

  /** A move of the other player, from the direct link or the event log: applied here right away (the host's state confirms it). */
  function applyMove(actorId: string, kind: string, payload: Record<string, unknown>, now: number) {
    const s = state.current;
    if (!s) return;
    const nonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
    if (!nonces.current.add(nonce ? `${kind}:${nonce}` : undefined)) return;
    const reported = typeof payload.at === "number" ? payload.at : now;
    const at = Math.max(now - REPORT_MAX_AGE_MS, Math.min(now + REPORT_MAX_AHEAD_MS, reported));
    if (kind === "serve") {
      servePingPong(s, actorId, at);
    } else if (kind === "swing") {
      const flightId = typeof payload.flightId === "number" ? payload.flightId : -1;
      if (s.flight && s.flight.id !== flightId) return;
      hitPingPong(s, actorId, at);
    }
    if (isHost) localAheadSince.current = 0;
  }

  function replayEvents(now: number) {
    const events = pendingEvents.current;
    pendingEvents.current = [];
    for (const event of events) {
      if (!event.actorId || event.actorId === me) continue;
      if (event.kind !== "swing" && event.kind !== "serve") continue;
      applyMove(event.actorId, event.kind, event.payload as Record<string, unknown>, now);
    }
  }

  /** The host publishes its state: over the direct link often, to the server a bit less. */
  function publish(now: number) {
    const s = state.current;
    if (!isHost || !s) return;
    if (now - lastBroadcast.current >= PINGPONG.broadcastMs) {
      lastBroadcast.current = now;
      if (transport.linkState().connected > 0) transport.broadcast({ t: "ppstate", nonce: randomNonce(), hostTime: Date.now(), state: serializePingPong(s) });
    }
    if (now - lastStore.current >= PINGPONG.storeMs) {
      lastStore.current = now;
      void transport.coop({ action: "state", state: { hostTime: Date.now(), state: serializePingPong(s) } });
    }
  }

  /** Ends the match for everybody with the score (the referee rewards both and hands the pot over). */
  async function finish() {
    const s = state.current;
    if (finishing.current || !s) return;
    finishing.current = true;
    setEnding(true);
    if (s.phase !== "over") endPingPong(s, transport.serverNow());
    const ok = await transport.coop({ action: "finish", points: { ...s.points }, longestRally: s.longestRally, hits: { ...s.hits }, perfects: { ...s.perfects } });
    if (!ok) {
      finishing.current = false;
      setEnding(false);
    }
  }

  /** Dev screens: Léa returns most balls and serves by herself. */
  function autoplayOther(s: PingPongState, now: number) {
    const other = s.players.find((p) => p !== me);
    if (!other) return;
    if (s.phase === "flight" && s.flight && s.flight.to === other) {
      const due = s.flight.arrivesAt + (((s.flight.id * 37) % 11) - 5) * 30;
      if (now >= due && now <= s.flight.arrivesAt + PINGPONG.goodMs) {
        const returns = ((s.flight.id * 7919) % 100) / 100 < PREVIEW_RETURN_RATE;
        if (returns) hitPingPong(s, other, now);
        else s.flight.arrivesAt -= PINGPONG.goodMs * 4; // let the tick call the miss right away
      }
    } else if (s.phase === "serve" && s.server === other) {
      if (previewServeAt.current === 0) previewServeAt.current = now + PREVIEW_SERVE_DELAY_MS;
      else if (now >= previewServeAt.current) {
        previewServeAt.current = 0;
        servePingPong(s, other, now);
      }
    } else previewServeAt.current = 0;
  }

  function onFrame(frame: CameraFrame) {
    const st = ensureStage(frame.videoWidth, frame.videoHeight);
    const sc = scene.current;
    if (!st || !sc) return;
    const snapshot = latest.current;
    const playing = snapshot.match.status === "playing";
    const s = playing ? ensureState(snapshot) : null;
    const byMarker = new Map<number, ArenaPlayerView>(snapshot.players.filter((p) => p.status === "ready" || p.status === "left").map((p) => [p.markerId, p]));

    const detections = new Map<number, Corner[]>();
    for (const found of frame.markers) {
      const player = byMarker.get(found.id);
      if (!player?.creature) continue;
      if (!st.isTracked(found.id)) {
        const input = meshInput(player.creature);
        if (!input) continue;
        st.ensureTarget(found.id, input);
        st.attach(found.id, sc.layerFor(found.id));
      }
      detections.set(found.id, found.corners);
      lastSeen.current.set(found.id, frame.now);
    }
    const visible = new Set<number>();
    for (const [id, at] of lastSeen.current) if (frame.now - at < HOLD_MS) visible.add(id);
    st.update(detections, visible);

    const now = transport.serverNow();
    const dt = lastFrame.current > 0 ? Math.max(0, Math.min(0.05, (frame.now - lastFrame.current) / 1000)) : 0;
    lastFrame.current = frame.now;
    if (s && phaseRef.current === "live") {
      replayEvents(now);
      // The other player left: the one who stays wins.
      const gone = snapshot.players.find((p) => p.status === "left" && s.players.includes(p.userId));
      if (gone && s.phase !== "over") concedePingPong(s, gone.userId, now);
      if (preview) autoplayOther(s, now);
      tickPingPong(s, now, { graceFor: (receiver) => (receiver === me ? 0 : PINGPONG.graceMs) });
      for (const effect of s.recent) {
        sc.note(effect, { state: s, now, markers: markers.current, worldPoint: (m, x, y, z, out) => st.worldPoint(m, x, y, z, out), localPoint: (m, w, out) => st.localPoint(m, w, out), mine: me });
        if (effect.kind === "point" && effect.player !== me && effect.reason !== "early") show(effect.reason === "left" ? "" : "Raté…", "bad");
        else if (effect.kind === "point" && effect.player === me && effect.reason !== "left") show("Point pour toi !", "good");
      }
      s.recent.length = 0;
      publish(frame.now);
      // The host reports the end; a guest does so when the host left the match (or, by hand, when the host went silent).
      if (s.phase === "over" && (isHost || preview || gone?.isHost) && !finishing.current) void finish();
    }

    // Each creature turns toward the other paper.
    for (const [userId, marker] of Object.entries(markers.current)) {
      const otherId = s?.players.find((p) => p !== userId);
      const otherMarker = otherId !== undefined ? markers.current[otherId] : undefined;
      let target = yaws.current[userId] ?? 0;
      if (otherMarker !== undefined && st.isTracked(otherMarker) && st.isTracked(marker)) {
        const w = st.worldPoint(otherMarker, 0, 0, 0, scratch.current);
        const l = w ? st.localPoint(marker, w, scratch2.current) : null;
        if (l) target = yawToward({ x: l.x, y: l.y });
      }
      let diff = target - (yaws.current[userId] ?? 0);
      while (diff > Math.PI) diff -= TWO_PI;
      while (diff < -Math.PI) diff += TWO_PI;
      yaws.current[userId] = (yaws.current[userId] ?? 0) + diff * Math.min(1, dt * YAW_SPEED);
      st.setYaw(marker, yaws.current[userId]);
    }
    sc.sync({ state: s, now, markers: markers.current, worldPoint: (m, x, y, z, out) => st.worldPoint(m, x, y, z, out), localPoint: (m, w, out) => st.localPoint(m, w, out), mine: me });
    st.render();

    // HUD, updated on change only.
    const other = s?.players.find((p) => p !== me) ?? participants(snapshot).find((p) => p.userId !== me)?.userId ?? "";
    const incoming = !!s && s.phase === "flight" && s.flight?.to === me;
    const serving = !!s && s.phase === "serve" && s.server === me;
    const fb = feedback.current && Date.now() - feedback.current.at < FEEDBACK_MS ? feedback.current : null;
    let prompt = "";
    if (!s) prompt = visible.size > 0 ? "Les deux créatures sont reconnues." : "Cadre les deux marqueurs posés sur la table.";
    else if (s.phase === "over") prompt = "Partie terminée.";
    else if (serving) prompt = "À toi de servir : appuie sur le bouton.";
    else if (s.phase === "serve") prompt = `${names.current[s.server] ?? "L'autre"} sert…`;
    else if (incoming) prompt = "La balle arrive : frappe quand l'anneau devient vert !";
    else if (s.phase === "flight") prompt = `Balle chez ${names.current[s.flight!.to] ?? "l'autre"}…`;
    else if (s.phase === "point" && s.lastPoint) prompt = s.lastPoint.to === me ? "Point pour toi !" : `Point pour ${names.current[s.lastPoint.to] ?? "l'autre"}.`;
    const next: Hud = {
      status: snapshot.match.status,
      seen: visible.size,
      ever: lastSeen.current.size > 0,
      link: transport.linkState(),
      phase: s?.phase ?? "waiting",
      mine: s?.points[me] ?? 0,
      theirs: s && other ? (s.points[other] ?? 0) : 0,
      otherName: names.current[other] ?? participants(snapshot).find((p) => p.userId === other)?.username ?? "",
      prompt,
      incoming,
      serving,
      rally: s?.currentRally ?? 0,
      secondsLeft: s ? Math.max(0, Math.ceil((s.endsAt - now) / 1000)) : 0,
      feedback: fb,
      hostSilent: !isHost && playing && hostSeenAt.current > 0 && Date.now() - hostSeenAt.current > PINGPONG.hostSilenceMs,
      over: s?.phase === "over",
    };
    const prev = hudRef.current;
    if (
      prev.status !== next.status ||
      prev.seen !== next.seen ||
      prev.ever !== next.ever ||
      prev.phase !== next.phase ||
      prev.mine !== next.mine ||
      prev.theirs !== next.theirs ||
      prev.otherName !== next.otherName ||
      prev.prompt !== next.prompt ||
      prev.incoming !== next.incoming ||
      prev.serving !== next.serving ||
      prev.rally !== next.rally ||
      prev.secondsLeft !== next.secondsLeft ||
      prev.feedback !== next.feedback ||
      prev.hostSilent !== next.hostSilent ||
      prev.over !== next.over ||
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
    const cam = new MarkerCamera(v);
    cam.onFrame = onFrame;
    camera.current = cam;
    try {
      const [started, stageMod, sceneMod] = await Promise.all([cam.start(), import("@/components/ar/three/stage"), import("@/components/ar/three/pingpong-scene")]);
      if (!started || camera.current !== cam) return;
      stageModule.current = stageMod;
      sceneModule.current = sceneMod;
      go("live");
    } catch (err) {
      console.error("[pingpong] cannot start", err);
      camera.current = null;
      setProblem(err instanceof CameraError ? err.kind : "error");
      go("intro");
    }
  }

  /** The player's button: a serve when it is their serve, a hit when the ball comes to them. */
  function swing(event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLDivElement>) {
    event?.preventDefault();
    const s = state.current;
    if (!s || phaseRef.current !== "live" || latest.current.match.status !== "playing") return;
    const at = transport.serverNow();
    if (s.phase === "serve" && s.server === me) {
      if (!servePingPong(s, me, at)) return;
      if (!isHost) localAheadSince.current = Date.now();
      const nonce = randomNonce();
      transport.broadcast({ t: "serve", nonce, at });
      if (relayNeeded()) void transport.coop({ action: "serve", at, nonce });
      show("Service !", "info");
      return;
    }
    if (s.phase === "flight" && s.flight && s.flight.to === me) {
      const flightId = s.flight.id;
      const outcome = hitPingPong(s, me, at);
      if (outcome.ok) show(QUALITY_TEXT[outcome.quality], outcome.quality === "perfect" ? "perfect" : "good");
      else if (outcome.reason === "early") show("Trop tôt !", "bad");
      else return;
      if (!isHost) localAheadSince.current = Date.now();
      const nonce = randomNonce();
      transport.broadcast({ t: "swing", nonce, flightId, at });
      if (relayNeeded()) void transport.coop({ action: "swing", flightId, at, nonce });
      return;
    }
    show(s.phase === "flight" ? "Attends la balle…" : "Patience…", "info");
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " " || event.key === "Enter") swing(event);
  }

  const cameraOn = phase === "starting" || phase === "live";
  const playing = hud.status === "playing";
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
        {cameraOn ? <canvas ref={glCanvas} data-pingpong-stage className="pointer-events-none absolute inset-0 h-full w-full object-cover" aria-hidden="true" /> : null}

        {phase === "live" ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-3 top-3 space-y-1.5"
              data-pingpong-hud
              data-status={hud.status}
              data-seen={hud.seen}
              data-phase={hud.phase}
              data-points={`${hud.mine}-${hud.theirs}`}
              data-incoming={hud.incoming}
              data-serving={hud.serving}
              data-link={hud.link.mode}
              data-peers={`${hud.link.connected}/${hud.link.total}`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink-950/70 px-3 py-1 text-sm font-semibold tabular-nums text-cream-50 backdrop-blur" aria-label={`Score : toi ${hud.mine}, ${hud.otherName} ${hud.theirs}`}>
                  <span className="text-brass-200">{hud.mine}</span> – {hud.theirs}
                  <span className="ml-2 text-xs font-normal text-cream-500">{hud.otherName}</span>
                </span>
                {playing ? <span className="rounded-full bg-ink-950/70 px-3 py-1 text-xs font-semibold tabular-nums text-cream-300 backdrop-blur">{hud.secondsLeft} s</span> : null}
                {hud.rally > 1 ? <span className="rounded-full bg-sage-700/70 px-3 py-1 text-xs font-semibold text-sage-100 backdrop-blur">échange ×{hud.rally}</span> : null}
                {hud.link.mode === "webrtc" ? (
                  <span className={cn("ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur", hud.link.total > 0 && hud.link.connected === hud.link.total ? "bg-sage-700/70 text-sage-100" : "bg-ink-950/70 text-cream-500")} data-link-label>
                    {linkLabel(hud.link)}
                  </span>
                ) : null}
              </div>
              {hud.prompt ? (
                <p className={cn("inline-block rounded-full px-3 py-1 text-xs font-semibold backdrop-blur", hud.incoming ? "bg-brass-400/90 text-ink-950" : hud.serving ? "bg-sage-500/90 text-ink-950" : "bg-ink-950/70 text-cream-200")} data-pingpong-prompt>
                  {hud.prompt}
                </p>
              ) : null}
            </div>
            {hud.feedback ? (
              <p
                key={hud.feedback.at}
                className={cn(
                  "pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-2xl px-4 py-2 font-display text-2xl font-semibold shadow-lg animate-rise",
                  hud.feedback.tone === "perfect" ? "bg-brass-400 text-ink-950" : hud.feedback.tone === "good" ? "bg-sage-500 text-ink-950" : hud.feedback.tone === "bad" ? "bg-danger/90 text-cream-50" : "bg-ink-950/80 text-cream-100",
                )}
                data-pingpong-feedback={hud.feedback.tone}
              >
                {hud.feedback.text}
              </p>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {hud.prompt} Score : {hud.mine} à {hud.theirs}.
            </p>

            {hud.status === "lobby" ? (
              <p className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-pingpong-notice="lobby">
                {hud.seen > 0 ? `${hud.seen} créature${hud.seen > 1 ? "s" : ""} reconnue${hud.seen > 1 ? "s" : ""}. ` : "Cadre les deux marqueurs posés face à face. "}
                La balle part quand l&apos;hôte lance la partie.
              </p>
            ) : null}

            {playing ? (
              <>
                {hud.seen === 0 ? (
                  <p className="pointer-events-none absolute inset-x-4 top-24 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur" data-pingpong-notice="lost">
                    Retrouve les marqueurs sur la table pour voir la balle.
                  </p>
                ) : hud.hostSilent ? (
                  <div className="absolute inset-x-4 top-24 flex flex-col items-center gap-2 rounded-2xl bg-ink-950/80 px-4 py-3 text-center text-sm text-cream-100 backdrop-blur" data-pingpong-notice="host-silent">
                    Plus de nouvelles de l&apos;hôte depuis un moment. Tu peux terminer la partie avec le score de ton téléphone.
                    <Button onClick={() => void finish()} disabled={ending} variant="secondary" className="w-auto px-5">
                      Terminer la partie
                    </Button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onPointerDown={swing}
                  aria-label={hud.serving ? "Servir" : "Frapper la balle"}
                  data-pingpong-hit
                  className={cn(
                    "absolute bottom-4 right-4 flex h-24 w-24 touch-none select-none flex-col items-center justify-center rounded-full text-ink-950 shadow-lg transition-transform active:scale-95",
                    hud.incoming ? "bg-brass-400 ring-4 ring-brass-200/70" : hud.serving ? "bg-sage-400" : "bg-cream-200/80",
                  )}
                >
                  <CircleDot className="h-9 w-9" aria-hidden="true" />
                  <span aria-hidden="true" className="text-[11px] font-bold uppercase tracking-wide">
                    {hud.serving ? "Servir" : "Frapper"}
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
            <CircleDot className="h-8 w-8 text-sage-300" aria-hidden="true" />
            <p className="max-w-xs text-sm leading-relaxed text-cream-100">
              {latest.current.match.status === "playing"
                ? "La balle est déjà en jeu ! Ouvre la caméra et cadre les deux marqueurs posés sur la table."
                : `Posez vos deux marqueurs face à face sur la table, à une trentaine de centimètres. La balle vole d'une créature à l'autre : appuie sur le bouton quand l'anneau autour de la tienne devient vert. Plus tu frappes juste, plus la balle repart vite. ${PINGPONG.pointsToWin} points pour gagner.`}
            </p>
            <Button onClick={() => void openCamera()} disabled={phase === "starting"} className="w-auto px-8" variant="brass">
              {phase === "starting" ? "Ouverture de la caméra…" : problem ? "Réessayer" : "Lancer la caméra"}
            </Button>
          </div>
        ) : null}

        {phase === "paused" ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-cream-100">Caméra coupée quand l&apos;écran est quitté. {isHost ? "La partie attend ton retour." : "La balle continue sans toi tant que tu ne reviens pas."}</p>
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
