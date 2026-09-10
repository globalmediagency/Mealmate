"use client";

import { Footprints } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { STEPS } from "@/lib/game/config";
import type { CreatureView } from "@/lib/game/creature-view";
import { cn } from "@/lib/utils/cn";

export type StepsSaveResponse = {
  date: string;
  today: number;
  gains: { healthGain: number; xpGain: number };
  creature: CreatureView | null;
};

type StepsFormProps = {
  initialSteps: number;
  onSaved?: (result: StepsSaveResponse) => void;
  compact?: boolean;
  className?: string;
};

/** Big, fast numeric entry for today's steps (one editable entry per day). */
export function StepsForm({ initialSteps, onSaved, compact = false, className }: StepsFormProps) {
  const [value, setValue] = useState(initialSteps > 0 ? String(initialSteps) : "");
  const [saved, setSaved] = useState(initialSteps);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const steps = Number(value.replace(/\s/g, ""));
    if (!Number.isFinite(steps) || steps < 0) {
      setError("Entre un nombre de pas valide.");
      return;
    }
    if (steps > STEPS.maxManualPerDay) {
      setError(`Maximum ${STEPS.maxManualPerDay.toLocaleString("fr-FR")} pas par jour.`);
      return;
    }
    setError(null);
    setFeedback(null);
    setPending(true);
    try {
      const response = await fetch("/api/steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
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
      setFeedback(parts.length ? `Enregistré · ${parts.join(" · ")}` : "Enregistré !");
      onSaved?.(body);
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setPending(false);
    }
  }

  const dirty = Number(value || 0) !== saved;

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-3", className)}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <label htmlFor="steps-today" className="block text-sm font-medium text-cream-300">
        {compact ? "Pas du jour" : "Combien de pas aujourd'hui ?"}
      </label>
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
            placeholder="ex. 6 500"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ""))}
            className="min-h-14 w-full rounded-2xl border border-ink-500 bg-ink-900/80 pl-12 pr-4 text-2xl font-semibold tabular-nums text-cream-50 placeholder:text-lg placeholder:font-normal placeholder:text-cream-700 focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-500/30"
          />
        </div>
        <Button type="submit" size="lg" className="w-auto px-5" disabled={pending || (!dirty && saved > 0)}>
          {pending ? "…" : saved > 0 && !dirty ? "OK" : "Valider"}
        </Button>
      </div>
      {feedback ? <p className="text-sm text-health">{feedback}</p> : null}
      <p className="text-xs text-cream-700">
        Une saisie par jour, modifiable. Le podomètre du téléphone arrivera plus tard.
      </p>
    </form>
  );
}
