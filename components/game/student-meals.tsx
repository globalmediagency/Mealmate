"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VERDICT_LABELS, type Verdict } from "@/lib/ai/meal-schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardText, CardTitle } from "@/components/ui/card";
import type { CoachingView } from "@/lib/coaching/service";
import type { MealThumb, MealView } from "@/lib/meals/service";
import { cn } from "@/lib/utils/cn";
import { scoreColor } from "./meal-result";

type Props = { coaching: CoachingView; meals: MealView[]; retentionDays: number; thumbsPerReward: number };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** The coach's view of one student: every meal of the retention window, with a thumb to give on each. */
export function StudentMeals({ coaching: initial, meals: initialMeals, retentionDays, thumbsPerReward }: Props) {
  const router = useRouter();
  const [coaching, setCoaching] = useState(initial);
  const [meals, setMeals] = useState(initialMeals);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  async function thumb(mealId: string, verdict: MealThumb) {
    setPending(mealId);
    setMessage(null);
    try {
      const response = await fetch(`/api/coaching/${coaching.id}/meals/${mealId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict }) });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string }; review?: MealThumb; thumbsUp?: number; thumbsDown?: number } | null;
      if (!response.ok || !body?.review) {
        setMessage({ tone: "danger", text: body?.error?.message ?? "Impossible d'enregistrer ce pouce." });
        return;
      }
      setMeals((list) => list.map((m) => (m.id === mealId ? { ...m, review: body.review! } : m)));
      setCoaching((c) => ({ ...c, thumbsUp: body.thumbsUp ?? c.thumbsUp, thumbsDown: body.thumbsDown ?? c.thumbsDown }));
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  async function end() {
    setPending("end");
    try {
      const response = await fetch(`/api/coaching/${coaching.id}/end`, { method: "POST" });
      if (!response.ok) {
        setMessage({ tone: "danger", text: "Impossible pour le moment." });
        return;
      }
      router.push("/coach");
      router.refresh();
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(null);
    }
  }

  const net = coaching.thumbsUp - coaching.thumbsDown;
  const reviewed = meals.filter((m) => m.review).length;

  return (
    <div className="space-y-5 animate-rise">
      <Card>
        <CardTitle className="text-lg">Les repas de {coaching.student.username}</CardTitle>
        <CardText className="mt-1">
          Photos des {retentionDays} derniers jours, avec la note de l&apos;application. Mets un pouce vert ou rouge à chaque repas : tous les {thumbsPerReward} pouces nets,{" "}
          {coaching.student.username} gagne un accessoire surprise.
        </CardText>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full border border-health/50 bg-health/15 px-2.5 py-1 font-semibold text-health">
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            {coaching.thumbsUp}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-danger/50 bg-danger/15 px-2.5 py-1 font-semibold text-danger">
            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
            {coaching.thumbsDown}
          </span>
          <span className="text-cream-500">
            net {net >= 0 ? "+" : ""}
            {net} · {reviewed}/{meals.length} repas noté{reviewed > 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {meals.length === 0 ? (
        <p className="rounded-3xl border border-ink-600/80 bg-ink-800/70 p-6 text-center text-sm text-cream-500">Aucun repas ces {retentionDays} derniers jours.</p>
      ) : (
        <ul className="space-y-2">
          {meals.map((meal) => (
            <li key={meal.id} className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-3 shadow-card">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meal.imageUrl} alt={`Repas de ${coaching.student.username}`} className="h-24 w-24 shrink-0 rounded-2xl object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-cream-500">{dateFormat.format(new Date(meal.createdAt))}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-cream-50">{meal.foods.slice(0, 4).join(", ") || VERDICT_LABELS[meal.verdict as Verdict]}</p>
                  <p className="mt-0.5 text-xs text-cream-500">
                    Note de l&apos;appli :{" "}
                    <span className="font-display text-lg font-semibold tabular-nums" style={{ color: scoreColor(meal.score) }}>
                      {meal.score}
                    </span>
                    /100 · {VERDICT_LABELS[meal.verdict as Verdict]}
                  </p>
                  {meal.comment ? <p className="mt-1 line-clamp-2 text-xs text-cream-300">{meal.comment}</p> : null}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Ton avis sur ce repas">
                <button
                  type="button"
                  onClick={() => thumb(meal.id, "up")}
                  disabled={pending === meal.id}
                  aria-pressed={meal.review === "up"}
                  className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors", meal.review === "up" ? "border-health bg-health/25 text-health" : "border-ink-500 text-cream-300 hover:border-health/60 hover:text-health")}
                >
                  <ThumbsUp className="h-5 w-5" aria-hidden="true" />
                  Pouce vert
                </button>
                <button
                  type="button"
                  onClick={() => thumb(meal.id, "down")}
                  disabled={pending === meal.id}
                  aria-pressed={meal.review === "down"}
                  className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors", meal.review === "down" ? "border-danger bg-danger/25 text-danger" : "border-ink-500 text-cream-300 hover:border-danger/60 hover:text-danger")}
                >
                  <ThumbsDown className="h-5 w-5" aria-hidden="true" />
                  Pouce rouge
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmEnd ? (
        <div className="flex gap-2">
          <Button variant="danger" className="w-auto px-4" onClick={end} disabled={pending !== null}>
            Mettre fin au coaching
          </Button>
          <Button variant="ghost" className="w-auto px-4" onClick={() => setConfirmEnd(false)}>
            Non
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmEnd(true)} className="min-h-11 text-xs font-semibold text-cream-500 underline underline-offset-2 hover:text-cream-300">
          Mettre fin au coaching de {coaching.student.username}
        </button>
      )}
    </div>
  );
}
