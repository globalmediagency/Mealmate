"use client";

import { Check, Footprints, HeartPulse, Lock, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Creature } from "@/components/creatures/creature";
import { Egg } from "@/components/creatures/egg";
import { RARITY_COLORS } from "@/components/creatures/rarity-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Species } from "@/lib/creatures/types";
import type { GameRules } from "@/lib/game/rules";
import {
  RARITIES,
  RARITY_LABELS,
  SPECIES_PER_RARITY,
  SPECIES_PER_TIER,
  TIER_CONFIG,
  TIERS,
  type Tier,
} from "@/lib/game/config";
import { cn } from "@/lib/utils/cn";

type EggChoiceProps = {
  speciesByTier: Record<Tier, Species[]>;
  obtainedSpeciesIds: string[];
  playableTiers: Tier[];
  /** Effective game rules (admin overrides applied). */
  rules: GameRules;
  /** Shown after a death or on a brand-new account. */
  intro?: string;
};

export function EggChoice({ speciesByTier, obtainedSpeciesIds, playableTiers, rules, intro }: EggChoiceProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Tier>("facile");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const obtained = new Set(obtainedSpeciesIds);

  async function choose() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/creatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selected }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Impossible de créer l'œuf.");
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
      setPending(false);
    }
  }

  const config = { ...TIER_CONFIG[selected], ...rules.tiers[selected] };
  const species = speciesByTier[selected];
  const playable = playableTiers.includes(selected);

  return (
    <div className="space-y-5 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-cream-50">Choisis ton œuf</h1>
        <p className="mt-2 text-sm leading-relaxed text-cream-500">
          {intro ??
            "Plus la créature est exigeante, plus elle attend une alimentation de qualité, et plus vite elle tombe malade si on la néglige. Les créatures faciles sont indulgentes."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Niveau de l'œuf">
        {TIERS.map((tier) => {
          const t = { ...TIER_CONFIG[tier], ...rules.tiers[tier] };
          const active = tier === selected;
          const locked = !playableTiers.includes(tier);
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(tier)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-3xl border p-3 text-center transition-colors",
                active ? "border-sage-500 bg-sage-800/30" : "border-ink-600/80 bg-ink-800/70 hover:border-ink-400",
                locked && "opacity-70",
              )}
            >
              <Egg tier={tier} size={64} animated={active} />
              <span className="mt-1 font-semibold text-cream-50">{t.label}</span>
              <span className="text-[11px] leading-tight text-cream-500">
                {t.hatchSteps.toLocaleString("fr-FR")} pas
              </span>
              {locked ? (
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-brass-300">
                  <Lock className="h-3 w-3" aria-hidden="true" /> Bientôt
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-cream-50">Œuf {config.label.toLowerCase()}</h2>
            <p className="text-sm text-sage-300">{config.universe}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-cream-300">{config.description}</p>

        <dl className="mt-4 space-y-2">
          <TierStat
            icon={Footprints}
            label="Pour éclore"
            value={`${config.hatchSteps.toLocaleString("fr-FR")} pas`}
            hint="Le total de tes pas depuis le choix de l'œuf, saisis à la main ou importés de Strava."
          />
          <TierStat
            icon={Utensils}
            label="Repas jugé sain"
            value={`note ≥ ${config.healthyScoreThreshold} / 100`}
            hint={`Chaque photo de repas reçoit une note sur 100. À partir de ${config.healthyScoreThreshold}, le repas fait monter la santé ; en dessous, elle baisse un peu.`}
          />
          <TierStat
            icon={HeartPulse}
            label="Survie sans soins"
            value={`${config.sickDaysBeforeDeath} jours de maladie`}
            hint={`Sans manger, la faim monte, puis la santé chute et la créature tombe malade. Après ${config.sickDaysBeforeDeath} jours de maladie sans repas sain ni soin, elle meurt.`}
          />
        </dl>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-cream-50">{SPECIES_PER_TIER} créatures à découvrir</h3>
            <span className="text-xs text-cream-500">
              {species.filter((s) => obtained.has(s.id)).length} obtenue(s)
            </span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {RARITIES.map((rarity) => (
              <li key={rarity} className="inline-flex items-center gap-1.5" style={{ color: RARITY_COLORS[rarity] }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RARITY_COLORS[rarity] }} />
                {SPECIES_PER_RARITY[rarity]} {RARITY_LABELS[rarity].toLowerCase()}
                {SPECIES_PER_RARITY[rarity] > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {species.map((s) => {
              const got = obtained.has(s.id);
              return (
                <div
                  key={s.id}
                  className="relative flex aspect-square items-center justify-center rounded-2xl bg-ink-900/70"
                  style={{ boxShadow: `inset 0 0 0 1px ${RARITY_COLORS[s.rarity]}55` }}
                  title={got ? s.name : "Espèce à découvrir"}
                >
                  <Creature species={s} stage="enfant" size="82%" animated={false} silhouette={!got} title={got ? s.name : "Silhouette"} />
                  {got ? (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-health text-ink-950">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, SPECIES_PER_TIER - species.length) }).map((_, i) => (
              <div key={`soon-${i}`} className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-ink-500 text-lg text-cream-700">
                ?
              </div>
            ))}
          </div>
          {species.length < SPECIES_PER_TIER ? (
            <p className="mt-2 text-xs text-cream-700">
              {SPECIES_PER_TIER - species.length} espèces sont encore en cours de création.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-cream-700">
            <Link href="/collection" className="underline">
              Voir toute la collection
            </Link>
          </p>
        </div>
      </section>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button onClick={choose} disabled={pending || !playable} variant={playable ? "primary" : "secondary"}>
        {!playable ? "Ce niveau arrive bientôt" : pending ? "Création de l'œuf…" : `Choisir l'œuf ${config.label.toLowerCase()}`}
      </Button>
    </div>
  );
}

function TierStat({ icon: Icon, label, value, hint }: { icon: typeof Footprints; label: string; value: string; hint: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-ink-900/70 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-700 text-sage-300">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wider text-cream-700">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold text-cream-50">{value}</dd>
        <dd className="mt-1 text-xs leading-relaxed text-cream-500">{hint}</dd>
      </div>
    </div>
  );
}
