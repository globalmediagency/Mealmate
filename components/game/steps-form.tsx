"use client";

import { Footprints, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { STEPS } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";

export type StepsSaveResponse = {
  date: string;
  today: number;
  added: number;
  gains: { healthGain: number; xpGain: number };
  creature: CreatureView | null;
};

type StepsFormProps = {
  initialSteps: number;
  onSaved?: (result: StepsSaveResponse) => void;
  compact?: boolean;
  className?: string;
};

const fmt = (n: number) => n.toLocaleString("fr-FR");

/**
 * Fast numeric entry for today's steps. Each entry ADDS to the day's total
 * (walk in the morning, add the afternoon later); "Corriger le total" lets
 * the user replace the day's value when a number was mistyped.
 */
export function StepsForm({ initialSteps, onSaved, compact = false, className }: StepsFormProps) {
  const [mode, setMode] = useState<"add" | "set">("add");
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(initialSteps);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function switchMode(next: "add" | "set") {
    setMode(next);
    setError(null);
    setFeedback(null);
    setValue(next === "set" && saved > 0 ? String(saved) : "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const steps = Number(value.replace(/\s/g, ""));
    if (!Number.isFinite(steps) || steps < 0 || value.trim() === "") {
      setError("Entre un nombre de pas valide.");
      return;
    }
    if (mode === "add" && steps === 0) {
      setError("Entre le nombre de pas à ajouter.");
      return;
    }
    const projected = mode === "add" ? saved + steps : steps;
    if (projected > STEPS.maxManualPerDay) {
      setError(
        mode === "add"
          ? `Maximum ${fmt(STEPS.maxManualPerDay)} pas par jour : tu en as déjà ${fmt(saved)}.`
          : `Maximum ${fmt(STEPS.maxManualPerDay)} pas par jour.`,
      );
      return;
    }
    setError(null);
    setFeedback(null);
    setPending(true);
    try {
      const response = await fetch("/api/steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps, mode }),
      });
      const body = (await response.json()) as StepsSaveResponse | { error: { message: string } };
      if (!response.ok || "error" in body) {
        setError("error" in body ? body.error.message : "Impossible d'enregistrer.");
        return;
      }
      setSaved(body.today);
      const parts: string[] = [];
      if (body.gains.healthGain > 0) parts.push(`+${body.gains.healthGain} santé`);
      if (body.gains.xpGain > 0) parts.push(`+${body.gains.xpGain} XP`);
      const head = mode === "add" ? `+${fmt(body.added)} pas · total du jour ${fmt(body.today)}` : `Total du jour corrigé : ${fmt(body.today)} pas`;
      setFeedback(parts.length ? `${head} · ${parts.join(" · ")}` : head);
      setValue("");
      setMode("add");
      onSaved?.(body);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-3", className)}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="steps-today" className="block text-sm font-medium text-cream-300">
          {mode === "set" ? "Total de la journée" : compact ? "Ajouter des pas" : "Combien de pas à ajouter ?"}
        </label>
        <p className="text-xs text-cream-500">
          Aujourd&apos;hui : <span className="font-semibold tabular-nums text-cream-100">{fmt(saved)}</span> pas
        </p>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Footprints className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cream-500" aria-hidden="true" />
          <input
            id="steps-today"
            name="steps"
            type="text"
            inputMode="numeric"
            pattern="[0-9 ]*"
            autoComplete="off"
            placeholder={mode === "set" ? "ex. 8 000" : "ex. 3 000"}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ""))}
            className="min-h-14 w-full rounded-2xl border border-ink-500 bg-ink-900/80 pl-12 pr-4 text-2xl font-semibold tabular-nums text-cream-50 placeholder:text-lg placeholder:font-normal placeholder:text-cream-700 focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-500/30"
          />
        </div>
        <Button type="submit" size="lg" className="w-auto px-5" disabled={pending || value.trim() === ""}>
          {pending ? "…" : mode === "set" ? "Corriger" : (
            <>
              <Plus className="h-5 w-5" aria-hidden="true" />
              Ajouter
            </>
          )}
        </Button>
      </div>
      {feedback ? <p className="text-sm text-health">{feedback}</p> : null}
      <p className="text-xs text-cream-700">
        {mode === "add" ? (
          <>
            Chaque saisie s&apos;ajoute au total du jour.{" "}
            {saved > 0 ? (
              <button type="button" onClick={() => switchMode("set")} className="min-h-11 underline underline-offset-2 hover:text-cream-300">
                Corriger le total
              </button>
            ) : null}
          </>
        ) : (
          <>
            Le nombre saisi remplace le total du jour.{" "}
            <button type="button" onClick={() => switchMode("add")} className="min-h-11 underline underline-offset-2 hover:text-cream-300">
              Revenir à l&apos;ajout
            </button>
          </>
        )}
        {" "}Les activités Strava comptent en plus.
      </p>
    </form>
  );
}
