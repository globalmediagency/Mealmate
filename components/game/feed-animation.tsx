"use client";

import { Heart } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Creature } from "@/components/creatures/creature";
import { FoodIcon } from "@/components/food/food-icon";
import { Button } from "@/components/ui/button";
import { VERDICT_LABELS, type Verdict } from "@/lib/ai/meal-schema";
import { getSpecies } from "@/lib/creatures";
import type { StageId } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { foodKindsFor, type FoodKind } from "@/lib/meals/food-icons";
import { cn } from "@/lib/utils/cn";
import { ScoreRing } from "./meal-result";

/** One creature fed by the meal, with the numbers the animation reveals. */
export type FeedAnimationTarget = {
  name: string | null;
  speciesId: string;
  stageId: StageId;
  state: CreatureState;
  healthBefore: number;
  healthAfter: number;
  hungerBefore: number;
  hungerAfter: number;
  healthDelta: number;
  /** Boarded with the user: the owner's name. */
  ownerName?: string | null;
};

export type FeedAnimationProps = {
  foods: string[];
  score: number;
  verdict: Verdict;
  targets: FeedAnimationTarget[];
  onDone: () => void;
};

type Phase = "appear" | "throw" | "eat" | "score";

/** Timeline (ms from mount). Kept short: the result screen follows right after. */
const T_THROW = 900;
const T_EAT = T_THROW + 800;
const T_SCORE = T_EAT + 1500;
const T_DONE = T_SCORE + 1400;
const THROW_STAGGER = 140;

const fmtDelta = (n: number) => {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : "±"}${Math.abs(rounded).toLocaleString("fr-FR")}`;
};

/**
 * Feeding choreography (spec § 4.6): drawings of the photographed food pop
 * in, fly to every creature fed by the meal, get eaten, the health change
 * floats above each creature while its gauge moves, then the score appears.
 * Skippable, and skipped outright under `prefers-reduced-motion`.
 */
export function FeedAnimation({ foods, score, verdict, targets, onDone }: FeedAnimationProps) {
  const [phase, setPhase] = useState<Phase>("appear");
  const [flights, setFlights] = useState<Record<string, { x: number; y: number }>>({});
  const container = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLDivElement>(null);
  const targetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const done = useRef(false);
  const kinds = foodKindsFor(foods);

  function finish() {
    if (done.current) return;
    done.current = true;
    onDone();
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    const timers = [
      window.setTimeout(() => setPhase("throw"), T_THROW),
      window.setTimeout(() => setPhase("eat"), T_EAT),
      window.setTimeout(() => setPhase("score"), T_SCORE),
      window.setTimeout(finish, T_DONE + Math.max(0, targets.length - 1) * THROW_STAGGER),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where each creature sits relative to the food's starting point, measured once the throw starts.
  useLayoutEffect(() => {
    if (phase !== "throw" || !origin.current) return;
    const from = origin.current.getBoundingClientRect();
    const next: Record<string, { x: number; y: number }> = {};
    targetRefs.current.forEach((el, index) => {
      if (!el) return;
      const to = el.getBoundingClientRect();
      next[index] = {
        x: to.left + to.width / 2 - (from.left + from.width / 2),
        y: to.top + to.height * 0.62 - (from.top + from.height / 2),
      };
    });
    setFlights(next);
  }, [phase]);

  const thrown = phase === "throw" || phase === "eat" || phase === "score";
  const eaten = phase === "eat" || phase === "score";

  return (
    <section
      ref={container}
      className="relative overflow-hidden rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card animate-rise"
      aria-live="polite"
      aria-label="Repas servi aux créatures"
    >
      <p className="text-center font-display text-xl text-cream-50">
        {phase === "appear" ? "À table !" : phase === "throw" ? "Ça arrive…" : phase === "eat" ? "Miam ?" : "Verdict"}
      </p>

      {/* Food drawings: pop in at the top, then each copy flies to one creature. */}
      <div ref={origin} className="relative mx-auto mt-3 flex h-16 w-fit items-center justify-center gap-2">
        {kinds.map((kind, i) => (
          <div key={kind} className={cn("mm-food-pop", thrown && "invisible")} style={{ animationDelay: `${i * 120}ms` }}>
            <FoodIcon kind={kind} size={56} />
          </div>
        ))}
        {thrown
          ? targets.map((_, t) =>
              kinds.map((kind, i) => <FlyingFood key={`${t}-${kind}`} kind={kind} to={flights[t]} delay={t * THROW_STAGGER + i * 110} eaten={eaten} />),
            )
          : null}
      </div>

      {/* The creatures, side by side. */}
      <div className={cn("mt-4 grid gap-2", targets.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {targets.map((target, index) => (
          <TargetCard
            key={index}
            target={target}
            phase={phase}
            size={targets.length > 1 ? 110 : 150}
            ref={(el) => {
              targetRefs.current[index] = el;
            }}
          />
        ))}
      </div>

      {/* The score, last. */}
      <div className="mt-4 flex min-h-24 items-center justify-center gap-3" aria-hidden={phase !== "score"}>
        {phase === "score" ? (
          <div className="mm-food-pop flex items-center gap-3">
            <ScoreRing score={score} size={88} />
            <div>
              <p className="text-xs uppercase tracking-wider text-cream-700">Note du repas</p>
              <p className="font-display text-lg text-cream-50">{VERDICT_LABELS[verdict]}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex justify-center">
        <Button variant="ghost" className="w-auto px-4" onClick={finish}>
          Passer
        </Button>
      </div>
    </section>
  );
}

function FlyingFood({ kind, to, delay, eaten }: { kind: FoodKind; to?: { x: number; y: number }; delay: number; eaten: boolean }) {
  if (!to) return null;
  const style = { "--tx": `${to.x}px`, "--ty": `${to.y}px`, animationDelay: eaten ? `${delay * 0.3}ms` : `${delay}ms` } as CSSProperties;
  return (
    <div className={cn("pointer-events-none absolute left-1/2 top-1/2 -ml-7 -mt-7", eaten ? "mm-food-eaten" : "mm-food-throw")} style={style} aria-hidden="true">
      <FoodIcon kind={kind} size={56} />
    </div>
  );
}

type TargetCardProps = { target: FeedAnimationTarget; phase: Phase; size: number; ref: (el: HTMLDivElement | null) => void };

function TargetCard({ target, phase, size, ref }: TargetCardProps) {
  const species = getSpecies(target.speciesId);
  const eaten = phase === "eat" || phase === "score";
  const reaction = phase === "appear" || phase === "throw" ? "sniff" : target.healthDelta < 0 ? "disgust" : "eat";
  const health = eaten ? target.healthAfter : target.healthBefore;
  const hunger = eaten ? target.hungerAfter : target.hungerBefore;
  const gained = target.healthDelta > 0;
  const lost = target.healthDelta < 0;
  return (
    <div ref={ref} className="relative flex flex-col items-center rounded-2xl border border-ink-600/60 bg-ink-900/50 px-2 pb-3 pt-2">
      {eaten ? (
        <p
          className={cn(
            "mm-delta-rise pointer-events-none absolute top-2 z-10 flex items-center gap-1 font-display text-2xl font-semibold tabular-nums drop-shadow",
            gained ? "text-health" : lost ? "text-danger" : "text-cream-300",
          )}
          aria-label={`${fmtDelta(target.healthDelta)} points de santé`}
        >
          {fmtDelta(target.healthDelta)}
          <Heart className="h-5 w-5" aria-hidden="true" fill="currentColor" />
        </p>
      ) : null}
      {species ? (
        <div style={{ width: size, height: size }}>
          <Creature species={species} stage={target.stageId} state={eaten && target.healthAfter < 30 ? "sick" : target.state} size={size} reaction={reaction} />
        </div>
      ) : null}
      <p className="mt-1 max-w-full truncate text-sm font-semibold text-cream-100">{target.name ?? "Ta créature"}</p>
      {target.ownerName ? <p className="text-[11px] text-cream-700">en pension, confiée par {target.ownerName}</p> : null}
      <div className="mt-2 w-full">
        <div className="mb-1 flex items-center justify-between text-[11px] text-cream-500">
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" aria-hidden="true" /> Santé
          </span>
          <span className="tabular-nums">{Math.round(health)} %</span>
        </div>
        <div role="meter" aria-label="Santé" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(health)} className="h-2 overflow-hidden rounded-full bg-ink-600">
          <div className="h-full rounded-full bg-health transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(0, Math.min(100, health))}%` }} />
        </div>
        <p className="mt-1 text-center text-[11px] text-cream-700">
          Faim {target.hungerBefore} → <span className={cn("transition-colors", eaten && "text-cream-300")}>{Math.round(hunger)}</span>
        </p>
      </div>
    </div>
  );
}
