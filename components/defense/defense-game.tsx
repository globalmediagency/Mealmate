"use client";

import { Crosshair, Egg, RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CameraError, MarkerCamera, type CameraFrame, type Corner } from "@/components/ar/marker-camera";
import { AccessorySprites, accessoryMarkup } from "@/components/ar/three/accessory-sprites";
import type { CreatureMeshInput } from "@/components/ar/three/creature-mesh";
import type { DefenseScene } from "@/components/ar/three/defense-scene";
import type { ThreeStage } from "@/components/ar/three/stage";
import type { ArTarget } from "@/components/ar/types";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { getSpecies } from "@/lib/creatures";
import { PLAY } from "@/lib/game/config";
import {
  bossesInWave,
  clampAim,
  computeDefenseScore,
  createDefense,
  endDefense,
  fireDefense,
  startDefense,
  stepDefense,
  tongueDefense,
  waveEnemyCount,
  type DefenseState,
  type DefenseStatus,
  type DefenseSummary,
} from "@/lib/game/defense";
import { playEffects, type PlayEffects } from "@/lib/game/play";
import type { DefenseRules } from "@/lib/game/rules";
import { cn } from "@/lib/utils/cn";

type StageModule = typeof import("@/components/ar/three/stage");
type SceneModule = typeof import("@/components/ar/three/defense-scene");
type TexturePromise = ReturnType<StageModule["textureFromSvg"]>;

type Phase = "intro" | "starting" | "scanning" | "playing" | "paused" | "submitting" | "done";
type Problem = "unsupported" | "denied" | "error" | "nogl" | "submit" | null;
type Hud = { status: DefenseStatus; wave: number; hp: number; score: number; seen: boolean; ever: boolean; bossHits: number | null; good: number; tongue: boolean };

export type DefenseResult = { score: number; perfect: boolean; effects: PlayEffects; playsLeft: number };

export type DefenseGameProps = {
  /** The creature to defend, with its marker number. */
  target: ArTarget;
  rules: DefenseRules;
  playsLeft: number;
  /** Daily limit shared by both games (admin rule). */
  maxPerDay?: number;
  /** A creature boarded with the user (default: the user's own creature). */
  creatureId?: string;
  homeHref?: string;
  /** Dev screens: no server call, the result is computed locally. */
  preview?: boolean;
};

/** The marker may flicker: its last pose is kept this long before the game pauses. */
const HOLD_MS = 1200;
/** Longest simulated sub-step: a slow frame is simulated in several steps, so nothing tunnels through the creature. */
const MAX_DT = 0.05;
/** A frame longer than this (tab hidden, phone busy) is not caught up: the game simply pauses for the rest. */
const MAX_FRAME_SECONDS = 0.5;
/** How fast the creature turns toward its last shot (radians per second, proportional). */
const YAW_SPEED = 10;
const TWO_PI = Math.PI * 2;

const IDLE_HUD: Hud = { status: "idle", wave: 0, hp: 0, score: 0, seen: false, ever: false, bossHits: null, good: 0, tongue: false };

/**
 * "Défendre" (spec § 3.21): a tower-defense game in augmented reality. The
 * creature stands on its printed marker; junk foods appear around it in a
 * puff of smoke and close in; the player aims with the centre of the screen
 * and throws eggs. The pure game lives in `lib/game/defense.ts`, the 3D in
 * `DefenseScene`; this component runs the camera, the loop and the HUD.
 */
export function DefenseGame({ target, rules, playsLeft: initialPlaysLeft, maxPerDay = PLAY.maxPerDay, creatureId, homeHref = "/home", preview = false }: DefenseGameProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [problem, setProblem] = useState<Problem>(null);
  const [hud, setHud] = useState<Hud>(IDLE_HUD);
  const [playsLeft, setPlaysLeft] = useState(initialPlaysLeft);
  const [result, setResult] = useState<DefenseResult | null>(null);
  const [summary, setSummary] = useState<DefenseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("intro");
  const hudRef = useRef<Hud>(IDLE_HUD);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const sprites = useRef<HTMLDivElement>(null);
  const camera = useRef<MarkerCamera | null>(null);
  const stage = useRef<ThreeStage | null>(null);
  const scene = useRef<DefenseScene | null>(null);
  const stageModule = useRef<StageModule | null>(null);
  const sceneModule = useRef<SceneModule | null>(null);
  const textures = useRef(new Map<string, TexturePromise>());
  const game = useRef<DefenseState | null>(null);
  const aim = useRef<{ x: number; y: number } | null>(null);
  const yaw = useRef(0);
  const lastFrame = useRef(0);
  const lastSeen = useRef(0);
  const species = getSpecies(target.creature.speciesId);
  const name = target.creature.name ?? "ta créature";

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  /** Releases the camera and the 3D scene (the game state survives, for a pause). */
  const teardown = useCallback(() => {
    camera.current?.stop();
    camera.current = null;
    scene.current?.dispose();
    scene.current = null;
    stage.current?.dispose();
    stage.current = null;
    for (const promise of textures.current.values()) void promise.then((t) => t?.dispose());
    textures.current.clear();
    aim.current = null;
    lastFrame.current = 0;
    lastSeen.current = 0;
    hudRef.current = IDLE_HUD;
  }, []);

  useEffect(() => teardown, [teardown]);

  // The camera drains the battery: pause when the tab goes to the background.
  useEffect(() => {
    const onHide = () => {
      if (!document.hidden) return;
      const current = phaseRef.current;
      if (current === "playing") {
        teardown();
        go("paused");
      } else if (current === "starting" || current === "scanning") {
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

  function meshInput(): CreatureMeshInput | null {
    if (!species) return null;
    return {
      species,
      stage: target.creature.stage,
      state: target.creature.state,
      accessories: target.creature.accessories,
      textures: (accessoryId, layer) => textureFor(`acc/${accessoryId}/${layer}`, accessoryMarkup(sprites.current, species.id, accessoryId, layer)),
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
      scene.current = new sceneMod.DefenseScene();
      if (preview) (window as unknown as { __defenseScene?: unknown }).__defenseScene = scene.current; // dev screens: inspectable from tests
      return created;
    } catch (err) {
      console.warn("[defense] WebGL unavailable", err);
      teardown();
      setProblem("nogl");
      go("intro");
      return null;
    }
  }

  function onFrame(frame: CameraFrame) {
    const s = ensureStage(frame.videoWidth, frame.videoHeight);
    const sc = scene.current;
    if (!s || !sc) return;
    const id = target.markerId;
    const found = frame.markers.find((m) => m.id === id);
    const detections = new Map<number, Corner[]>();
    if (found) {
      lastSeen.current = frame.now;
      if (!s.isTracked(id)) {
        const input = meshInput();
        if (!input) return;
        s.ensureTarget(id, input);
        s.attach(id, sc.root);
        sc.setMouth(s.mouthOf(id));
      }
      detections.set(id, found.corners);
    }
    const seen = lastSeen.current > 0 && frame.now - lastSeen.current < Math.max(HOLD_MS, 3 * frame.period);
    s.update(detections, seen ? new Set([id]) : new Set());
    const point = seen ? s.aimOnMarker(id) : null;
    aim.current = point ? clampAim(point) : null;
    const elapsed = lastFrame.current > 0 ? Math.max(0, Math.min(MAX_FRAME_SECONDS, (frame.now - lastFrame.current) / 1000)) : 0;
    lastFrame.current = frame.now;
    const state = game.current;
    if (state && seen && phaseRef.current === "playing") {
      for (let left = elapsed; left > 0; left -= MAX_DT) stepDefense(state, Math.min(MAX_DT, left));
    }
    const dt = Math.min(MAX_DT, elapsed);
    if (state) {
      let diff = state.yaw - yaw.current;
      while (diff > Math.PI) diff -= TWO_PI;
      while (diff < -Math.PI) diff += TWO_PI;
      yaw.current += diff * Math.min(1, dt * YAW_SPEED);
      s.setYaw(id, yaw.current);
    }
    sc.sync(state, aim.current);
    s.render();
    const boss = state?.enemies.find((e) => e.boss && e.phase === "moving");
    const next: Hud = {
      status: state?.status ?? "idle",
      wave: state?.wave ?? 0,
      hp: state?.hp ?? rules.hp,
      score: state?.score ?? 0,
      seen,
      ever: lastSeen.current > 0,
      bossHits: boss ? boss.hits : null,
      good: state?.bonuses.length ?? 0,
      tongue: state?.tongue !== null && state?.tongue !== undefined,
    };
    const prev = hudRef.current;
    if (
      prev.status !== next.status ||
      prev.wave !== next.wave ||
      prev.hp !== next.hp ||
      prev.score !== next.score ||
      prev.seen !== next.seen ||
      prev.ever !== next.ever ||
      prev.bossHits !== next.bossHits ||
      prev.good !== next.good ||
      prev.tongue !== next.tongue
    ) {
      hudRef.current = next;
      setHud(next);
    }
    if (state?.status === "over" && phaseRef.current === "playing") void finish();
  }

  /** Opens the camera, for a new game or to resume a paused one. */
  async function openCamera(fresh: boolean) {
    const v = video.current;
    if (!v) return;
    setProblem(null);
    setError(null);
    go("starting");
    if (fresh) {
      game.current = createDefense(rules);
      yaw.current = 0;
      setResult(null);
      setSummary(null);
    }
    const cam = new MarkerCamera(v, target.image ? [{ id: target.markerId, url: target.image }] : []);
    cam.onFrame = onFrame;
    camera.current = cam;
    try {
      const [started, stageMod, sceneMod] = await Promise.all([cam.start(), import("@/components/ar/three/stage"), import("@/components/ar/three/defense-scene")]);
      if (!started || camera.current !== cam) return;
      stageModule.current = stageMod;
      sceneModule.current = sceneMod;
      go(game.current?.status === "idle" ? "scanning" : "playing");
    } catch (err) {
      console.error("[defense] cannot start", err);
      camera.current = null;
      setProblem(err instanceof CameraError ? err.kind : "error");
      go("intro");
    }
  }

  function begin() {
    const state = game.current;
    if (!state || phaseRef.current !== "scanning") return;
    startDefense(state);
    lastFrame.current = 0;
    go("playing");
  }

  function fire(event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLDivElement>) {
    event?.preventDefault();
    const state = game.current;
    const point = aim.current;
    if (!state || !point || phaseRef.current !== "playing") return;
    fireDefense(state, point);
  }

  function lick(event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLDivElement>) {
    event?.preventDefault();
    const state = game.current;
    const point = aim.current;
    if (!state || !point || phaseRef.current !== "playing") return;
    tongueDefense(state, point);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " " || event.key === "Enter") fire(event);
    else if (event.key === "l" || event.key === "L") lick(event);
  }

  /** Ends the game (or acknowledges its end), stops the camera and records the result. */
  async function finish() {
    const state = game.current;
    if (!state) return;
    if (state.status !== "over") endDefense(state);
    go("submitting");
    teardown();
    const counters: DefenseSummary = { ...state.summary };
    setSummary(counters);
    if (preview) {
      const { score, perfect } = computeDefenseScore(counters, rules);
      const left = Math.max(0, playsLeft - 1);
      setResult({ score, perfect, effects: playEffects(score), playsLeft: left });
      setPlaysLeft(left);
      go("done");
      return;
    }
    try {
      const response = await fetch("/api/defense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spawned: counters.spawned, destroyed: counters.destroyed, reached: counters.reached, wavesCleared: counters.wavesCleared, creatureId }),
      });
      const body = (await response.json().catch(() => null)) as DefenseResult | { error: { message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        setError(body && "error" in body ? body.error.message : "Impossible d'enregistrer la partie.");
        setProblem("submit");
        go("done");
        return;
      }
      setResult(body);
      setPlaysLeft(body.playsLeft);
      go("done");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setProblem("submit");
      go("done");
    }
  }

  const cameraOn = phase === "starting" || phase === "scanning" || phase === "playing" || phase === "submitting";
  const inGame = phase === "playing";
  const waveSize = hud.wave > 0 ? waveEnemyCount(hud.wave, rules) : 0;
  const waveBosses = hud.wave > 0 ? bossesInWave(hud.wave, rules) : 0;
  const hpPercent = rules.hp > 0 ? Math.max(0, Math.min(100, (hud.hp / rules.hp) * 100)) : 0;

  return (
    <div className="space-y-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Défendre {name}</h1>
          <p className="mt-0.5 text-sm text-cream-500">
            {inGame ? "Vise avec le centre de l'écran, tire des œufs sur la malbouffe." : `${playsLeft} partie${playsLeft > 1 ? "s" : ""} restante${playsLeft > 1 ? "s" : ""} aujourd'hui, jeu et défense confondus.`}
          </p>
        </div>
      </header>

      <div
        ref={box}
        role="application"
        aria-label="Zone de jeu"
        tabIndex={inGame ? 0 : -1}
        onKeyDown={onKeyDown}
        className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-ink-600/80 bg-ink-950 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400/70", !cameraOn && "flex items-center justify-center")}
      >
        <video ref={video} playsInline muted autoPlay className={cn("absolute inset-0 h-full w-full object-cover", !cameraOn && "hidden")} aria-label="Image de la caméra" />
        {cameraOn ? <canvas ref={glCanvas} data-defense-stage className="pointer-events-none absolute inset-0 h-full w-full object-cover" aria-hidden="true" /> : null}

        {phase === "scanning" || inGame ? (
          <>
            {/* HUD */}
            <div
              className="pointer-events-none absolute inset-x-3 top-3 flex items-center gap-2"
              data-defense-hud
              data-wave={hud.wave}
              data-hp={hud.hp}
              data-score={hud.score}
              data-status={hud.status}
              data-boss-hits={hud.bossHits ?? undefined}
              data-good={hud.good}
              data-tongue={hud.tongue ? "out" : undefined}
            >
              <span className="rounded-full bg-ink-950/70 px-3 py-1 text-xs font-semibold text-cream-50 backdrop-blur">{hud.wave > 0 ? `Vague ${hud.wave}` : "Prêt"}</span>
              <div className="flex-1 rounded-full bg-ink-950/70 p-1 backdrop-blur" role="meter" aria-label="Points de vie" aria-valuemin={0} aria-valuemax={rules.hp} aria-valuenow={Math.round(hud.hp)}>
                <div className={cn("h-2 rounded-full transition-[width] duration-300", hpPercent > 50 ? "bg-health" : hpPercent > 25 ? "bg-brass-400" : "bg-danger")} style={{ width: `${hpPercent}%` }} />
              </div>
              <span className="rounded-full bg-ink-950/70 px-3 py-1 text-xs font-semibold tabular-nums text-brass-200 backdrop-blur">{hud.score} pts</span>
            </div>
            {/* Crosshair */}
            <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cream-50/85 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]">
              <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream-50" />
              <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 -translate-y-full bg-cream-50/85" />
              <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 translate-y-full bg-cream-50/85" />
              <span className="absolute left-0 top-1/2 h-px w-2 -translate-x-full -translate-y-1/2 bg-cream-50/85" />
              <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 translate-x-full bg-cream-50/85" />
            </div>
            <p className="sr-only" aria-live="polite">
              {hud.wave > 0 ? `Vague ${hud.wave}, ${Math.round(hud.hp)} points de vie, ${hud.score} points.` : ""}
              {hud.bossHits !== null ? ` Boss en approche : encore ${hud.bossHits} œuf${hud.bossHits > 1 ? "s" : ""}.` : ""}
            </p>
            {hud.bossHits !== null ? (
              <p className="pointer-events-none absolute inset-x-3 top-12 text-center text-xs font-semibold text-brass-200 drop-shadow" aria-hidden="true">
                Boss : encore {hud.bossHits} œuf{hud.bossHits > 1 ? "s" : ""}
              </p>
            ) : null}

            {phase === "scanning" ? (
              hud.seen ? (
                <div className="absolute inset-x-4 bottom-4 flex flex-col items-center gap-2 rounded-2xl bg-ink-950/75 px-4 py-3 text-center backdrop-blur">
                  <p className="text-sm text-cream-100">{name} est en place. La malbouffe va arriver de tous les côtés : garde le marqueur dans l&apos;image.</p>
                  <Button onClick={begin} variant="brass" className="w-auto px-8">
                    Commencer
                  </Button>
                </div>
              ) : (
                <p className="pointer-events-none absolute inset-x-4 bottom-4 rounded-2xl bg-ink-950/70 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur">
                  Cadre le marqueur de {name}{target.image ? ", imprimé ou photo," : ""} bien à plat et éclairé.
                </p>
              )
            ) : null}

            {inGame ? (
              <>
                {!hud.seen ? (
                  <p className="pointer-events-none absolute inset-x-4 top-14 rounded-2xl bg-ink-950/75 px-4 py-2 text-center text-sm text-cream-100 backdrop-blur">
                    Retrouve le marqueur de {name} : le jeu est en pause.
                  </p>
                ) : hud.status === "intro" ? (
                  <div className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center gap-1 text-center drop-shadow">
                    <p className="font-display text-4xl font-semibold text-cream-50">Vague {hud.wave}</p>
                    <p className="text-sm text-cream-200">
                      {waveSize} aliment{waveSize > 1 ? "s" : ""} en approche
                      {waveBosses > 0 ? "… dont un boss géant, à n'importe quel moment !" : ""}
                    </p>
                  </div>
                ) : null}
                <button
                  type="button"
                  onPointerDown={fire}
                  aria-label="Lancer un œuf"
                  data-defense-fire
                  className="absolute bottom-4 right-4 flex h-20 w-20 touch-none select-none items-center justify-center rounded-full bg-brass-400 text-ink-950 shadow-lg transition-transform active:scale-95"
                >
                  <Egg className="h-9 w-9" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onPointerDown={lick}
                  aria-label="Tirer la langue"
                  data-defense-tongue
                  className="absolute bottom-6 right-28 flex h-16 w-16 touch-none select-none flex-col items-center justify-center rounded-full bg-[#e88a9a] text-ink-950 shadow-lg transition-transform active:scale-95"
                >
                  <span aria-hidden="true" className="block h-6 w-3.5 rounded-b-full rounded-t-sm bg-[#b83d5a]" />
                  <span aria-hidden="true" className="text-[10px] font-bold uppercase tracking-wide">
                    Langue
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void finish()}
                  className="absolute bottom-4 left-4 inline-flex min-h-11 items-center rounded-full bg-ink-950/70 px-4 text-xs font-semibold text-cream-300 backdrop-blur hover:text-cream-50"
                >
                  Abandonner
                </button>
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
            <Crosshair className="h-8 w-8 text-sage-300" aria-hidden="true" />
            <p className="max-w-xs text-sm leading-relaxed text-cream-100">
              Pose le marqueur de {name} sur une table. Des burgers, frites et sodas surgissent autour d&apos;elle et foncent dessus : vise avec le centre de l&apos;écran et
              lance des œufs pour les détruire avant qu&apos;ils ne la touchent. Des fruits et légumes apparaissent aussi un instant : le bouton « Langue » les attrape
              pour regagner de la vie, mais gare à la malbouffe avalée par erreur. Les vagues vont de plus en plus vite
              {rules.bossEveryWaves > 0 ? `, et un boss géant, qui encaisse plusieurs œufs, ferme une vague sur ${rules.bossEveryWaves}` : ""}.
            </p>
            <Button onClick={() => void openCamera(true)} disabled={playsLeft <= 0 || phase === "starting"} className="w-auto px-8">
              {phase === "starting" ? "Ouverture de la caméra…" : playsLeft <= 0 ? "Plus de partie aujourd'hui" : problem ? "Réessayer" : "Lancer la caméra"}
            </Button>
          </div>
        ) : null}

        {phase === "paused" ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-cream-100">Partie en pause : la caméra est coupée quand l&apos;écran est quitté.</p>
            <div className="flex gap-2">
              <Button onClick={() => void openCamera(false)} variant="brass" className="w-auto px-6">
                Reprendre
              </Button>
              <Button onClick={() => void finish()} variant="secondary" className="w-auto px-6">
                Abandonner
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "submitting" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-950/60 text-sm text-cream-100 backdrop-blur-sm">Enregistrement…</div>
        ) : null}

        {phase === "done" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-950/85 p-6 text-center backdrop-blur-sm" data-defense-result>
            {problem === "submit" ? (
              <>
                <Alert tone="danger">{error ?? "Impossible d'enregistrer la partie."}</Alert>
                <Button onClick={() => void finish()} className="w-auto px-6">
                  Réessayer l&apos;envoi
                </Button>
              </>
            ) : result ? (
              <>
                <Trophy className="h-8 w-8 text-brass-300" aria-hidden="true" />
                <p className="font-display text-5xl font-semibold text-cream-50">{result.score}</p>
                <p className="text-sm text-cream-300">{result.perfect ? "Défense parfaite !" : result.score >= 70 ? "Bien défendu !" : "La malbouffe a gagné cette fois, on réessaie ?"}</p>
                {summary ? (
                  <p className="text-xs text-cream-500">
                    Vague {summary.wavesCleared + 1} atteinte · {summary.destroyed}/{summary.spawned} aliment{summary.spawned > 1 ? "s" : ""} détruit{summary.destroyed > 1 ? "s" : ""}
                    {summary.reached > 0 ? ` · ${summary.reached} passé${summary.reached > 1 ? "s" : ""}` : ""}
                    {summary.bosses > 0 ? ` · ${summary.bosses} boss abattu${summary.bosses > 1 ? "s" : ""}` : ""} · {summary.shots} œuf{summary.shots > 1 ? "s" : ""}
                    {summary.goodEaten > 0 ? ` · ${summary.goodEaten} bon${summary.goodEaten > 1 ? "s" : ""} aliment${summary.goodEaten > 1 ? "s" : ""} mangé${summary.goodEaten > 1 ? "s" : ""} (+${summary.healed} vie)` : ""}
                    {summary.junkEaten > 0 ? ` · ${summary.junkEaten} malbouffe avalée${summary.junkEaten > 1 ? "s" : ""}` : ""}
                  </p>
                ) : null}
                <p className="text-xs text-cream-500">
                  +{result.effects.moodDelta} humeur · +{result.effects.xpDelta} XP
                  {result.effects.xpMultiplier > 1
                    ? ` (bonne humeur : XP ×${result.effects.xpMultiplier.toLocaleString("fr-FR")})`
                    : result.effects.xpMultiplier < 1
                      ? ` (humeur basse : XP ×${result.effects.xpMultiplier.toLocaleString("fr-FR")})`
                      : ""}
                </p>
              </>
            ) : null}
            <div className="mt-2 flex gap-2">
              {playsLeft > 0 && problem !== "submit" ? (
                <Button onClick={() => void openCamera(true)} className="w-auto px-5" variant="brass">
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  Rejouer ({playsLeft})
                </Button>
              ) : null}
              <LinkButton href={homeHref} variant="secondary" className="w-auto px-5">
                Retour
              </LinkButton>
            </div>
          </div>
        ) : null}
      </div>

      <AccessorySprites ref={sprites} items={[{ speciesId: target.creature.speciesId, accessories: target.creature.accessories }]} />

      <p className="text-center text-xs text-cream-700">
        Maximum {maxPerDay} partie{maxPerDay > 1 ? "s" : ""} par jour, jeu et défense confondus. Les points de vie perdus ici ne touchent pas la vraie créature.{" "}
        <Link href={homeHref} className="underline">
          {homeHref === "/home" ? "Retour à l'accueil" : "Retour à la pension"}
        </Link>
      </p>
    </div>
  );
}
