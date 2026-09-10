"use client";

import { Camera, RotateCcw, Sparkles, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Creature } from "@/components/creatures/creature";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { getSpecies } from "@/lib/creatures";
import { FEEDING } from "@/lib/game/config";
import { isSuspiciousPhoto } from "@/lib/ai/meal-schema";
import type { CreatureView } from "@/lib/game/creature-view";
import type { MealEffects } from "@/lib/game/meal-effects";
import { prepareMealImage } from "@/lib/images/resize-client";
import type { MealView } from "@/lib/meals/service";
import { MealResult } from "./meal-result";

type FeedFlowProps = { creature: CreatureView; mealsToday: number };

type FeedResponse = {
  meal: MealView;
  effects: MealEffects;
  before: { health: number; hunger: number; mood: number };
  creature: CreatureView;
  mealsToday: number;
};

type State =
  | { step: "idle" }
  | { step: "preview"; blob: Blob; url: string }
  | { step: "analyzing"; url: string }
  | { step: "result"; url: string; data: FeedResponse }
  | { step: "error"; message: string; url?: string; blob?: Blob; code?: string };

export function FeedFlow({ creature: initial, mealsToday: initialCount }: FeedFlowProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "idle" });
  const [creature, setCreature] = useState(initial);
  const [mealsToday, setMealsToday] = useState(initialCount);
  const cameraInput = useRef<HTMLInputElement>(null);
  const species = creature.species ? getSpecies(creature.species.id) : undefined;
  const remaining = Math.max(0, FEEDING.maxMealsPerDay - mealsToday);

  useEffect(() => {
    return () => {
      if ("url" in state && state.url) URL.revokeObjectURL(state.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(file: File | null) {
    if (!file) return;
    try {
      const blob = await prepareMealImage(file);
      setState({ step: "preview", blob, url: URL.createObjectURL(blob) });
    } catch {
      setState({ step: "error", message: "Impossible de lire cette image. Essaie une autre photo." });
    }
  }

  async function analyze(blob: Blob, url: string) {
    setState({ step: "analyzing", url });
    const form = new FormData();
    form.append("image", blob, "meal.jpg");
    try {
      const response = await fetch("/api/meals", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as FeedResponse | { error: { code: string; message: string } } | null;
      if (!response.ok || !body || "error" in body) {
        const err = body && "error" in body ? body.error : null;
        setState({ step: "error", message: err?.message ?? "L'analyse a échoué. Réessaie.", code: err?.code, url, blob });
        return;
      }
      setCreature(body.creature);
      setMealsToday(body.mealsToday);
      setState({ step: "result", url, data: body });
      router.refresh();
    } catch {
      setState({ step: "error", message: "Impossible de joindre le serveur. Vérifie ta connexion.", url, blob });
    }
  }

  // Camera only: `capture` opens the camera directly on phones, no gallery picker (the easy way to cheat).
  const inputs = (
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
  );

  if (state.step === "result") {
    const { data } = state;
    const reaction = data.effects.healthy ? "eat" : data.effects.healthDelta < 0 ? "disgust" : "eat";
    return (
      <div className="space-y-5 animate-rise">
        {isSuspiciousPhoto(data.meal.photoSource) ? (
          <Alert tone="warning" title={data.meal.photoSource === "printed" ? "Hmm, on dirait une image imprimée" : "Hmm, on dirait une photo d'écran"}>
            Cette image ressemble à {data.meal.photoSource === "printed" ? "une image imprimée" : "une photo prise sur un écran"}. Le repas est compté pour cette fois, mais bientôt seules les vraies assiettes seront acceptées.
          </Alert>
        ) : null}
        <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
          <div className="flex items-center gap-3">
            {species ? (
              <div className="shrink-0" style={{ width: 96, height: 96 }}>
                <Creature species={species} stage={data.creature.stage.id} state={data.creature.state} size={96} reaction={reaction} />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-semibold text-cream-50">
                {data.effects.healthy ? "Miam, merci !" : data.effects.healthDelta < 0 ? "Hmm… bof." : "Ça passe !"}
              </h1>
              <p className="text-sm text-cream-500">
                {data.effects.full ? "Je n'avais plus très faim, l'effet est réduit." : `Faim ${Math.round(data.before.hunger)} → ${Math.round(data.creature.hunger)}`}
                {" · "}+{data.effects.xpDelta} XP
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.url} alt="Ton repas" className="h-40 w-full object-cover" />
          </div>
          <div className="mt-4">
            <MealResult
              data={{
                score: data.meal.score,
                verdict: data.meal.verdict,
                foods: data.meal.foods,
                macros: data.meal.macros,
                portion: data.meal.portion,
                comment: data.meal.comment,
                creatureLine: data.meal.creatureLine,
                healthDelta: data.meal.healthDelta,
              }}
              creatureName={creature.name ?? undefined}
            />
          </div>
        </section>
        <div className="grid grid-cols-2 gap-2">
          <LinkButton href="/home" variant="primary">
            Retour à {creature.name ?? "ma créature"}
          </LinkButton>
          <LinkButton href="/meals" variant="secondary">
            Mes repas
          </LinkButton>
        </div>
        {remaining > 0 ? (
          <Button variant="ghost" onClick={() => setState({ step: "idle" })}>
            <Camera className="h-5 w-5" aria-hidden="true" />
            Un autre repas ({remaining} restant{remaining > 1 ? "s" : ""} aujourd&apos;hui)
          </Button>
        ) : null}
      </div>
    );
  }

  if (state.step === "analyzing") {
    return (
      <div className="space-y-5 animate-rise">
        <section className="flex flex-col items-center rounded-3xl border border-ink-600/80 bg-ink-800/90 p-6 text-center shadow-card">
          <div className="relative overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.url} alt="" className="h-36 w-full max-w-xs object-cover opacity-70" />
          </div>
          {species ? (
            <div className="-mt-10" style={{ width: 150, height: 150 }}>
              <Creature species={species} stage={creature.stage.id} state={creature.state} size={150} reaction="sniff" />
            </div>
          ) : null}
          <p className="mt-2 font-display text-xl text-cream-50">Je renifle…</p>
          <p className="mt-1 text-sm text-cream-500">Analyse de ton assiette, quelques secondes.</p>
          <span className="mt-4 inline-block h-1.5 w-40 overflow-hidden rounded-full bg-ink-600">
            <span className="block h-full w-1/2 rounded-full bg-sage-400 animate-pulse-soft" />
          </span>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-rise">
      {inputs}
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Nourrir {creature.name}</h1>
        <p className="mt-1 text-sm text-cream-500">
          Prends ton assiette en photo. {remaining > 0 ? `${remaining} repas possible${remaining > 1 ? "s" : ""} aujourd'hui.` : "Plus de repas possible aujourd'hui."}
        </p>
      </header>

      {state.step === "error" ? (
        <Alert tone={state.code === "not_food" || state.code === "meal_limit" || state.code === "screen_photo" ? "warning" : "danger"}>{state.message}</Alert>
      ) : null}

      {state.step === "preview" || (state.step === "error" && state.url) ? (
        <section className="space-y-4 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
          <div className="overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.url} alt="Aperçu de ton repas" className="max-h-72 w-full object-cover" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              onClick={() => {
                const blob = state.step === "preview" ? state.blob : state.blob;
                if (blob && state.url) analyze(blob, state.url);
              }}
              disabled={remaining === 0 || state.step === "error" && state.code === "meal_limit"}
            >
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              {state.step === "error" ? "Réessayer" : "Analyser ce repas"}
            </Button>
            <Button variant="secondary" className="w-auto px-4" onClick={() => setState({ step: "idle" })} aria-label="Reprendre une photo">
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-6 text-center shadow-card">
          {species ? (
            <div style={{ width: 150, height: 150 }}>
              <Creature species={species} stage={creature.stage.id} state={creature.state} size={150} />
            </div>
          ) : null}
          <p className="max-w-xs text-sm leading-relaxed text-cream-300">
            {creature.hunger >= 60 ? "J'ai faim ! Qu'est-ce que tu me donnes ?" : creature.hunger < FEEDING.fullHungerThreshold ? "Je n'ai pas très faim, mais je goûterai." : "Montre-moi ton assiette !"}
          </p>
          <Button onClick={() => cameraInput.current?.click()} disabled={remaining === 0}>
            <Camera className="h-5 w-5" aria-hidden="true" />
            Prendre une photo
          </Button>
          <p className="text-xs text-cream-700">
            Prends la photo sur le moment : elle est redimensionnée sur ton appareil avant envoi et visible par toi seul·e.{" "}
            <Link href="/privacy" className="underline">
              Confidentialité
            </Link>
          </p>
        </section>
      )}

      <LinkButton href="/meals" variant="ghost">
        <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
        Voir l&apos;historique des repas
      </LinkButton>
    </div>
  );
}
