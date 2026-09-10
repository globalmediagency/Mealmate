"use client";

import { RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TIER_CONFIG, TIERS, type Tier } from "@/lib/game/config";
import {
  DEFAULT_RULES,
  TIER_RULE_LABELS,
  mergeRules,
  simulateNeglect,
  type GameRules,
  type GameRulesPatch,
  type TierRules,
} from "@/lib/game/rules";
import { cn } from "@/lib/utils/cn";

type RulesFormProps = {
  initialRules: GameRules;
  storedPatch: GameRulesPatch;
  updatedAt: string | null;
  updatedBy: string | null;
};

type TierField = keyof TierRules;
const TIER_FIELDS = Object.keys(TIER_RULE_LABELS) as TierField[];

type Draft = {
  tiers: Record<Tier, Record<TierField, string>>;
  hungerDamageThreshold: string;
  fullRateHoursCap: string;
  slowRatePercent: string;
  maxMealsPerDay: string;
  rejectScreenPhotos: boolean;
};

function toDraft(rules: GameRules): Draft {
  return {
    tiers: Object.fromEntries(
      TIERS.map((tier) => [tier, Object.fromEntries(TIER_FIELDS.map((f) => [f, String(rules.tiers[tier][f])]))]),
    ) as Draft["tiers"],
    hungerDamageThreshold: String(rules.hungerDamageThreshold),
    fullRateHoursCap: String(rules.tick.fullRateHoursCap),
    slowRatePercent: String(Math.round(rules.tick.slowRate * 100)),
    maxMealsPerDay: String(rules.feeding.maxMealsPerDay),
    rejectScreenPhotos: rules.feeding.rejectScreenPhotos,
  };
}

function toPatch(draft: Draft): GameRulesPatch {
  const num = (value: string) => Number(value.replace(",", "."));
  return {
    tiers: Object.fromEntries(
      TIERS.map((tier) => [tier, Object.fromEntries(TIER_FIELDS.map((f) => [f, num(draft.tiers[tier][f])]))]),
    ) as GameRulesPatch["tiers"],
    hungerDamageThreshold: num(draft.hungerDamageThreshold),
    tick: { fullRateHoursCap: num(draft.fullRateHoursCap), slowRate: num(draft.slowRatePercent) / 100 },
    feeding: { maxMealsPerDay: num(draft.maxMealsPerDay), rejectScreenPhotos: draft.rejectScreenPhotos },
  };
}

function safePreview(draft: Draft): GameRules | null {
  try {
    const patch = toPatch(draft);
    const flat = [
      ...TIERS.flatMap((t) => TIER_FIELDS.map((f) => patch.tiers?.[t]?.[f])),
      patch.hungerDamageThreshold,
      patch.tick?.fullRateHoursCap,
      patch.tick?.slowRate,
      patch.feeding?.maxMealsPerDay,
    ];
    if (flat.some((v) => v === undefined || Number.isNaN(v))) return null;
    return mergeRules(patch);
  } catch {
    return null;
  }
}

const fmtHours = (h: number) => (Number.isFinite(h) ? (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} j`) : "jamais");
const fmtDays = (d: number) => (Number.isFinite(d) ? `${d.toFixed(1)} j` : "jamais");

export function RulesForm({ initialRules, storedPatch, updatedAt, updatedBy }: RulesFormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialRules));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const preview = useMemo(() => safePreview(draft), [draft]);
  const hasOverrides = Object.keys(storedPatch).length > 0;

  function setTier(tier: Tier, field: TierField, value: string) {
    setDraft((d) => ({ ...d, tiers: { ...d.tiers, [tier]: { ...d.tiers[tier], [field]: value } } }));
  }

  async function submit(reset = false) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : { patch: toPatch(draft) }),
      });
      const body = (await response.json().catch(() => null)) as { rules?: GameRules; error?: { message?: string } } | null;
      if (!response.ok || !body?.rules) {
        setMessage({ tone: "danger", text: body?.error?.message ?? "Enregistrement impossible." });
        return;
      }
      setDraft(toDraft(body.rules));
      setMessage({ tone: "success", text: reset ? "Valeurs par défaut restaurées." : "Règles enregistrées." });
    } catch {
      setMessage({ tone: "danger", text: "Impossible de joindre le serveur." });
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "w-full min-h-11 rounded-xl border border-ink-500 bg-ink-900/80 px-3 text-base tabular-nums text-cream-50 focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-500/30";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-6"
    >
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {hasOverrides && updatedAt ? (
        <p className="text-xs text-cream-500">
          Dernière modification {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(updatedAt))}
          {updatedBy ? ` par ${updatedBy}` : ""}. Les valeurs différentes du défaut sont surlignées.
        </p>
      ) : (
        <p className="text-xs text-cream-500">Aucune surcharge enregistrée : les valeurs par défaut du code s&apos;appliquent.</p>
      )}

      <section className="overflow-x-auto rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card">
        <h2 className="font-display text-xl text-cream-50">Exigence par niveau d&apos;œuf</h2>
        <table className="mt-3 w-full min-w-[560px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-cream-700">
              <th className="w-1/3 font-medium">Paramètre</th>
              {TIERS.map((tier) => (
                <th key={tier} className="font-medium">
                  {TIER_CONFIG[tier].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIER_FIELDS.map((field) => (
              <tr key={field}>
                <th scope="row" className="pr-3 text-left font-normal">
                  <span className="block text-cream-100">{TIER_RULE_LABELS[field].label}</span>
                  <span className="block text-[11px] text-cream-700">
                    {TIER_RULE_LABELS[field].help} ({TIER_RULE_LABELS[field].unit})
                  </span>
                </th>
                {TIERS.map((tier) => {
                  const changed = Number(draft.tiers[tier][field].replace(",", ".")) !== DEFAULT_RULES.tiers[tier][field];
                  return (
                    <td key={tier} className="pr-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.tiers[tier][field]}
                        onChange={(e) => setTier(tier, field, e.target.value)}
                        aria-label={`${TIER_RULE_LABELS[field].label} — ${TIER_CONFIG[tier].label}`}
                        className={cn(inputClass, changed && "border-brass-500/70 bg-brass-500/10")}
                      />
                      <span className="mt-0.5 block text-[10px] text-cream-700">défaut {DEFAULT_RULES.tiers[tier][field]}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card sm:grid-cols-2">
        <h2 className="font-display text-xl text-cream-50 sm:col-span-2">Règles communes</h2>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Seuil de faim qui abîme la santé</span>
          <input type="text" inputMode="decimal" value={draft.hungerDamageThreshold} onChange={(e) => setDraft((d) => ({ ...d, hungerDamageThreshold: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">Faim de 0 à 100 · défaut {DEFAULT_RULES.hungerDamageThreshold}</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Repas maximum par jour</span>
          <input type="text" inputMode="numeric" value={draft.maxMealsPerDay} onChange={(e) => setDraft((d) => ({ ...d, maxMealsPerDay: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">défaut {DEFAULT_RULES.feeding.maxMealsPerDay}</span>
        </label>
        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={draft.rejectScreenPhotos}
            onChange={(e) => setDraft((d) => ({ ...d, rejectScreenPhotos: e.target.checked }))}
            className="mt-0.5 h-5 w-5 shrink-0 accent-sage-500"
          />
          <span>
            <span className="text-cream-100">Refuser les photos d&apos;écran ou d&apos;images imprimées</span>
            <span className="block text-[11px] text-cream-700">
              L&apos;IA repère les photos prises d&apos;un écran ou d&apos;une image imprimée. Décoché : le repas compte, avec un avertissement.
              Coché : le repas est refusé et il faut photographier la vraie assiette. Défaut : {DEFAULT_RULES.feeding.rejectScreenPhotos ? "refusé" : "avertissement"}.
            </span>
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Heures à plein régime après une absence</span>
          <input type="text" inputMode="decimal" value={draft.fullRateHoursCap} onChange={(e) => setDraft((d) => ({ ...d, fullRateHoursCap: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">Au-delà, la dégradation est ralentie · défaut {DEFAULT_RULES.tick.fullRateHoursCap} h</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Rythme ralenti au-delà (%)</span>
          <input type="text" inputMode="decimal" value={draft.slowRatePercent} onChange={(e) => setDraft((d) => ({ ...d, slowRatePercent: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">défaut {Math.round(DEFAULT_RULES.tick.slowRate * 100)} %</span>
        </label>
      </section>

      <section className="rounded-3xl border border-sage-700/50 bg-sage-800/20 p-4">
        <h2 className="font-display text-xl text-cream-50">Simulation : une créature jamais nourrie</h2>
        {preview ? (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-cream-700">
                <th className="font-medium">Niveau</th>
                <th className="font-medium">Faim critique</th>
                <th className="font-medium">Malade</th>
                <th className="font-medium">Mort</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => {
                const sim = simulateNeglect(preview, tier);
                return (
                  <tr key={tier} className="border-t border-ink-600/60">
                    <td className="py-2 text-cream-100">{TIER_CONFIG[tier].label}</td>
                    <td className="py-2 tabular-nums text-cream-300">{fmtHours(sim.hoursToStarving)}</td>
                    <td className="py-2 tabular-nums text-cream-300">{fmtHours(sim.hoursToSick)}</td>
                    <td className="py-2 tabular-nums text-brass-300">{fmtDays(sim.daysToDeath)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-danger">Une valeur n&apos;est pas un nombre.</p>
        )}
        <p className="mt-2 text-[11px] text-cream-700">
          Depuis l&apos;éclosion, sans aucun repas ni marche, app ouverte régulièrement. Un repas sain fait remonter la santé et
          remet la faim à zéro (−40).
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="w-auto" disabled={pending || !preview}>
          <Save className="h-5 w-5" aria-hidden="true" />
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="secondary" className="w-auto" disabled={pending} onClick={() => submit(true)}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          Valeurs par défaut
        </Button>
      </div>
    </form>
  );
}
