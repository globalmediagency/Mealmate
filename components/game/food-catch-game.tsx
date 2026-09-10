"use client";

import { Gamepad2, RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Creature, type EquippedAccessory, type Reaction } from "@/components/creatures/creature";
import { Environment } from "@/components/creatures/environment";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { getSpecies } from "@/lib/creatures";
import { PLAY } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import type { PlayEffects } from "@/lib/game/play";
import { computePlayScore } from "@/lib/game/play";

const HEALTHY = ["🥦", "🍎", "🥕", "🍓", "🥑", "🍇", "🥗", "🍌", "🍅", "🫐"];
const JUNK = ["🍟", "🍩", "🍔", "🍬", "🥤", "🍭", "🍕"];
const DURATION_MS = PLAY.durationSeconds * 1000;
const POOL = 10;
const ITEM_PX = 44;
const CREATURE_PX = 104;

type Item = { active: boolean; healthy: boolean; x: number; y: number; speed: number; el: HTMLDivElement | null; emoji: string };

type Phase = "intro" | "playing" | "submitting" | "done" | "error";

type PlayResponse = {
  score: number;
  perfect: boolean;
  effects: PlayEffects;
  playsToday: number;
  playsLeft: number;
  creature: CreatureView;
};

type FoodCatchGameProps = { creature: CreatureView; accessories: EquippedAccessory[]; playsLeft: number };

export function FoodCatchGame({ creature, accessories, playsLeft: initialPlaysLeft }: FoodCatchGameProps) {
  const router = useRouter();
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const [phase, setPhase] = useState<Phase>("intro");
  const [playsLeft, setPlaysLeft] = useState(initialPlaysLeft);
  const [timeLeft, setTimeLeft] = useState<number>(PLAY.durationSeconds);
  const [liveScore, setLiveScore] = useState(0);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [result, setResult] = useState<PlayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floating, setFloating] = useState<{ id: number; x: number; y: number; text: string; good: boolean }[]>([]);

  const arenaRef = useRef<HTMLDivElement>(null);
  const creatureRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Item[]>([]);
  const stats = useRef({ healthySpawned: 0, healthyCaught: 0, junkHit: 0, junkSpawned: 0 });
  const targetX = useRef(0);
  const currentX = useRef(0);
  const rafRef = useRef<number | null>(null);
  const reactionTimer = useRef<number | null>(null);
  const floatId = useRef(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const setItemRef = (index: number) => (el: HTMLDivElement | null) => {
    if (!itemsRef.current[index]) itemsRef.current[index] = { active: false, healthy: true, x: 0, y: 0, speed: 0, el, emoji: "" };
    else itemsRef.current[index].el = el;
  };

  function react(kind: Reaction, text: string, x: number, y: number, good: boolean) {
    setReaction(kind);
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setReaction(null), 650);
    const id = (floatId.current += 1);
    setFloating((list) => [...list.slice(-4), { id, x, y, text, good }]);
    window.setTimeout(() => setFloating((list) => list.filter((f) => f.id !== id)), 900);
  }

  async function submit() {
    setPhase("submitting");
    try {
      const response = await fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ healthySpawned: stats.current.healthySpawned, healthyCaught: stats.current.healthyCaught, junkHit: stats.current.junkHit }),
      });
      const body = (await response.json().catch(() => null)) as PlayResponse | { error: { message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        setError(body && "error" in body ? body.error.message : "Impossible d'enregistrer la partie.");
        setPhase("error");
        return;
      }
      setResult(body);
      setPlaysLeft(body.playsLeft);
      setPhase("done");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setPhase("error");
    }
  }

  function start() {
    const arena = arenaRef.current;
    if (!arena) return;
    const width = arena.clientWidth;
    const height = arena.clientHeight;
    stats.current = { healthySpawned: 0, healthyCaught: 0, junkHit: 0, junkSpawned: 0 };
    for (const item of itemsRef.current) {
      item.active = false;
      if (item.el) item.el.style.transform = "translate(-9999px, -9999px)";
    }
    currentX.current = targetX.current = (width - CREATURE_PX) / 2;
    setLiveScore(0);
    setTimeLeft(PLAY.durationSeconds);
    setResult(null);
    setError(null);
    setPhase("playing");

    const startedAt = performance.now();
    let lastTime = startedAt;
    let nextSpawn = startedAt + 500;
    let lastSecond: number = PLAY.durationSeconds;
    const catchLine = height - CREATURE_PX + 22;

    const spawn = (now: number) => {
      const slot = itemsRef.current.find((i) => !i.active);
      if (!slot) return;
      const elapsed = (now - startedAt) / DURATION_MS;
      const healthy = Math.random() < 0.65;
      slot.active = true;
      slot.healthy = healthy;
      slot.emoji = healthy ? HEALTHY[Math.floor(Math.random() * HEALTHY.length)] : JUNK[Math.floor(Math.random() * JUNK.length)];
      slot.x = 8 + Math.random() * (width - ITEM_PX - 16);
      slot.y = -ITEM_PX;
      slot.speed = 150 + elapsed * 160 + Math.random() * 40; // px/s
      if (healthy) stats.current.healthySpawned += 1;
      else stats.current.junkSpawned += 1;
      if (slot.el) slot.el.textContent = slot.emoji;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsedMs = now - startedAt;
      const remaining = Math.max(0, Math.ceil((DURATION_MS - elapsedMs) / 1000));
      if (remaining !== lastSecond) {
        lastSecond = remaining;
        setTimeLeft(remaining);
      }

      // Creature follows the finger with a little easing.
      currentX.current += (targetX.current - currentX.current) * Math.min(1, dt * 14);
      if (creatureRef.current) creatureRef.current.style.transform = `translateX(${currentX.current}px)`;
      const creatureCenter = currentX.current + CREATURE_PX / 2;

      if (now >= nextSpawn && elapsedMs < DURATION_MS - 900) {
        spawn(now);
        nextSpawn = now + Math.max(420, 720 - (elapsedMs / DURATION_MS) * 300);
      }

      for (const item of itemsRef.current) {
        if (!item.active) continue;
        item.y += item.speed * dt;
        const centerX = item.x + ITEM_PX / 2;
        if (item.y + ITEM_PX >= catchLine && item.y < height - 10 && Math.abs(centerX - creatureCenter) < CREATURE_PX * 0.42) {
          item.active = false;
          if (item.el) item.el.style.transform = "translate(-9999px, -9999px)";
          if (item.healthy) {
            stats.current.healthyCaught += 1;
            react("eat", "+1", item.x, item.y, true);
          } else {
            stats.current.junkHit += 1;
            react("disgust", "beurk", item.x, item.y, false);
          }
          setLiveScore(computePlayScore(stats.current).score);
          continue;
        }
        if (item.y > height) {
          item.active = false;
          if (item.el) item.el.style.transform = "translate(-9999px, -9999px)";
          continue;
        }
        if (item.el) item.el.style.transform = `translate(${item.x}px, ${item.y}px)`;
      }

      if (elapsedMs >= DURATION_MS) {
        stopLoop();
        for (const item of itemsRef.current) {
          item.active = false;
          if (item.el) item.el.style.transform = "translate(-9999px, -9999px)";
        }
        setLiveScore(computePlayScore(stats.current).score);
        void submit();
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  function onPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (phase !== "playing") return;
    const arena = arenaRef.current;
    if (!arena) return;
    const rect = arena.getBoundingClientRect();
    const x = event.clientX - rect.left - CREATURE_PX / 2;
    targetX.current = Math.max(0, Math.min(rect.width - CREATURE_PX, x));
  }

  if (!species) return null;

  return (
    <div className="space-y-4 animate-rise">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Jouer avec {creature.name}</h1>
          <p className="mt-1 text-sm text-cream-500">
            {phase === "playing" ? "Glisse ton doigt pour la déplacer." : `${playsLeft} partie${playsLeft > 1 ? "s" : ""} restante${playsLeft > 1 ? "s" : ""} aujourd'hui.`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-3xl font-semibold tabular-nums text-cream-50">{phase === "playing" ? `${timeLeft}s` : ""}</p>
          {phase === "playing" ? <p className="text-xs text-cream-500">score {liveScore}</p> : null}
        </div>
      </header>

      <div
        ref={arenaRef}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        className="relative touch-none select-none overflow-hidden rounded-3xl border border-ink-600/80 shadow-card"
        style={{ height: "min(60vh, 520px)" }}
        role="application"
        aria-label="Zone de jeu"
      >
        <div className="absolute inset-0">
          <Environment tier={creature.tier} />
        </div>

        {Array.from({ length: POOL }).map((_, i) => (
          <div
            key={i}
            ref={setItemRef(i)}
            aria-hidden="true"
            className="absolute left-0 top-0 flex items-center justify-center text-[34px] leading-none will-change-transform"
            style={{ width: ITEM_PX, height: ITEM_PX, transform: "translate(-9999px, -9999px)" }}
          />
        ))}

        {floating.map((f) => (
          <span
            key={f.id}
            aria-hidden="true"
            className={`pointer-events-none absolute text-sm font-bold mm-fx-float ${f.good ? "text-health" : "text-danger"}`}
            style={{ left: f.x, top: f.y }}
          >
            {f.text}
          </span>
        ))}

        <div ref={creatureRef} className="absolute bottom-0 left-0 will-change-transform" style={{ width: CREATURE_PX, height: CREATURE_PX }}>
          <Creature species={species} stage={creature.stage.id} state={creature.state} size={CREATURE_PX} reaction={reaction} accessories={accessories} animated={phase !== "playing"} />
        </div>

        {phase === "intro" || phase === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-950/70 p-6 text-center backdrop-blur-sm">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Gamepad2 className="h-8 w-8 text-sage-300" aria-hidden="true" />
            <p className="max-w-xs text-sm leading-relaxed text-cream-100">
              Attrape les aliments sains 🥦🍎 et évite la malbouffe 🍟🍩 pendant {PLAY.durationSeconds} secondes. Glisse ton doigt
              pour déplacer {creature.name}.
            </p>
            <Button onClick={start} disabled={playsLeft <= 0} className="w-auto px-8">
              {playsLeft <= 0 ? "Plus de partie aujourd'hui" : "Commencer"}
            </Button>
          </div>
        ) : null}

        {phase === "submitting" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-950/60 text-sm text-cream-100 backdrop-blur-sm">Enregistrement…</div>
        ) : null}

        {phase === "done" && result ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-950/75 p-6 text-center backdrop-blur-sm">
            <Trophy className="h-8 w-8 text-brass-300" aria-hidden="true" />
            <p className="font-display text-5xl font-semibold text-cream-50">{result.score}</p>
            <p className="text-sm text-cream-300">
              {result.perfect ? "Partie parfaite !" : result.score >= 70 ? "Bien joué !" : "Pas mal, on réessaie ?"}
            </p>
            <p className="text-xs text-cream-500">
              +{result.effects.moodDelta} humeur · +{result.effects.xpDelta} XP
              {stats.current.junkHit > 0 ? ` · ${stats.current.junkHit} malbouffe attrapée${stats.current.junkHit > 1 ? "s" : ""}` : ""}
            </p>
            <div className="mt-2 flex gap-2">
              {playsLeft > 0 ? (
                <Button onClick={start} className="w-auto px-5" variant="brass">
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  Rejouer ({playsLeft})
                </Button>
              ) : null}
              <LinkButton href="/home" variant="secondary" className="w-auto px-5">
                Retour
              </LinkButton>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-center text-xs text-cream-700">
        Maximum {PLAY.maxPerDay} parties par jour. <Link href="/home" className="underline">Retour à l&apos;accueil</Link>
      </p>
    </div>
  );
}
