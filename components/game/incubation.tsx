"use client";

import { Activity, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Egg } from "@/components/creatures/egg";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { TIER_CONFIG } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import { crackLevel } from "@/lib/game/steps";
import { HatchReveal } from "./hatch-reveal";
import { StepsForm } from "./steps-form";

type IncubationProps = { creature: CreatureView; todaySteps: number };

type Phase = "idle" | "shake" | "burst" | "reveal";

const SHAKE_MS = 1700;
const BURST_MS = 550;

export function Incubation({ creature: initial, todaySteps }: IncubationProps) {
  const router = useRouter();
  const [creature, setCreature] = useState(initial);
  const [phase, setPhase] = useState<Phase>("idle");
  const [hatched, setHatched] = useState<CreatureView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((t) => window.clearTimeout(t));
  }, []);

  const config = TIER_CONFIG[creature.tier];
  const progress = creature.hatchProgress;
  const percent = Math.round(progress * 100);
  const crack = crackLevel(progress);

  async function hatch() {
    setError(null);
    setPhase("shake");
    const request = fetch("/api/creatures/hatch", { method: "POST" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { creature: CreatureView }
          | { error: { message: string } }
          | null;
        if (!response.ok || !body || "error" in body) {
          throw new Error(body && "error" in body ? body.error.message : "L'éclosion a échoué.");
        }
        return body.creature;
      });
    const wait = new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, SHAKE_MS));
    });
    try {
      const [born] = await Promise.all([request, wait]);
      setPhase("burst");
      timers.current.push(
        window.setTimeout(() => {
          setHatched(born);
          setPhase("reveal");
        }, BURST_MS),
      );
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "L'éclosion a échoué.");
    }
  }

  if (phase === "reveal" && hatched) {
    return <HatchReveal creature={hatched} onNamed={() => router.refresh()} />;
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Ton œuf couve</h1>
          <p className="mt-1 text-sm text-cream-500">{config.universe}</p>
        </div>
        <Badge>Niveau {config.label.toLowerCase()}</Badge>
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-ink-600/80 bg-ink-800/90 px-4 pb-5 pt-6 text-center shadow-card">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(60%_60%_at_50%_40%,rgba(139,160,122,0.18),transparent_70%)]" />
        <div className="relative mx-auto" style={{ width: 210, height: 210 }}>
          <Egg tier={creature.tier} crack={crack} size={210} phase={phase === "shake" ? "shake" : phase === "burst" ? "burst" : "idle"} />
        </div>

        <div className="relative mt-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-cream-50">
              {creature.eggSteps.toLocaleString("fr-FR")} / {creature.hatchSteps.toLocaleString("fr-FR")} pas
            </span>
            <span className="tabular-nums text-cream-500">{percent} %</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progression de l'éclosion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2 h-3 overflow-hidden rounded-full bg-ink-600"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sage-600 via-sage-400 to-brass-400 transition-[width] duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-cream-700">
            {creature.canHatch
              ? "Il est prêt ! Appuie pour le faire éclore."
              : "La coquille se fissure à 25, 50 et 75 %. Chaque pas compte, depuis le jour où tu l'as choisi."}
          </p>
        </div>

        {creature.canHatch ? (
          <div className="relative mt-4">
            {error ? <Alert tone="danger" className="mb-3 text-left">{error}</Alert> : null}
            <Button variant="brass" onClick={hatch} disabled={phase !== "idle"} className="animate-pulse-soft">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              {phase === "idle" ? "Faire éclore !" : "Ça bouge…"}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-5 shadow-card">
        <StepsForm
          initialSteps={todaySteps}
          onSaved={(result) => {
            if (result.creature) setCreature(result.creature);
          }}
        />
      </section>

      <LinkButton href="/activity" variant="secondary">
        <Activity className="h-5 w-5" aria-hidden="true" />
        Importer mes activités Strava
      </LinkButton>
    </div>
  );
}
