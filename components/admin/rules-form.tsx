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
  maxPerHost: string;
  cooldownMultiplier: string;
  mealRetentionDays: string;
  thumbsPerStudentReward: string;
  thumbsPerCoachReward: string;
  mood: Record<MoodField, string>;
  defense: Record<DefenseField, string>;
  maxPlaysPerDay: string;
};

const DEFENSE_FIELDS = ["hp", "baseSpeed", "speedGrowthPercent", "firstWaveEnemies", "enemiesGrowthPerWave", "fireCooldownMs", "bossEveryWaves", "bossHits"] as const;
type DefenseField = (typeof DEFENSE_FIELDS)[number];

const DEFENSE_LABELS: Record<DefenseField, { label: string; help: string; integer: boolean }> = {
  hp: { label: "Points de vie de la créature", help: "Dans le jeu seulement : rien ne touche la vraie créature.", integer: true },
  baseSpeed: { label: "Vitesse des aliments à la vague 1", help: "En côtés de marqueur par seconde (le carré imprimé fait 1). Les aliments partent à 2,8 côtés.", integer: false },
  speedGrowthPercent: { label: "Accélération par vague (%)", help: "Ajouté à la vitesse de base à chaque nouvelle vague.", integer: false },
  firstWaveEnemies: { label: "Aliments à la vague 1", help: "Nombre d'aliments de la première vague.", integer: true },
  enemiesGrowthPerWave: { label: "Aliments en plus par vague", help: "Chaque vague en envoie autant de plus que la précédente.", integer: true },
  fireCooldownMs: { label: "Rechargement entre deux œufs (ms)", help: "0 = tir libre.", integer: true },
  bossEveryWaves: { label: "Un boss toutes les N vagues", help: "Un aliment géant, deux fois plus lent et plus dangereux, surgit à un moment aléatoire de ces vagues. 0 = jamais.", integer: true },
  bossHits: { label: "Œufs pour abattre le premier boss", help: "Chaque boss suivant demande un œuf de plus ; sa barre de vie s'affiche au-dessus de lui.", integer: true },
};

const MOOD_FIELDS = ["happyMin", "xpBonusPercent", "lowMax", "xpMalusPercent", "gloomyMax", "healthLossPerHourWhenGloomy", "chestStepsBonusPercent"] as const;
type MoodField = (typeof MOOD_FIELDS)[number];

const MOOD_LABELS: Record<MoodField, { label: string; help: string }> = {
  happyMin: { label: "Humeur « ravie » à partir de", help: "Sur 100. Au-dessus : bonus d'XP et pas bonus pour les coffres." },
  xpBonusPercent: { label: "Bonus d'XP quand ravie (%)", help: "Sur les repas, les parties et les pas." },
  lowMax: { label: "Humeur « morose » en dessous de", help: "Sur 100. En dessous : malus d'XP." },
  xpMalusPercent: { label: "Malus d'XP quand morose (%)", help: "Sur les repas, les parties et les pas." },
  gloomyMax: { label: "Humeur « triste » en dessous de", help: "Sur 100. En dessous : la créature perd de la santé même nourrie." },
  healthLossPerHourWhenGloomy: { label: "Perte de santé quand triste", help: "Points de santé par heure, en plus de la faim." },
  chestStepsBonusPercent: { label: "Pas bonus pour les coffres quand ravie (%)", help: "Pas supplémentaires comptés pour les coffres sur chaque pas crédité." },
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
    maxPerHost: String(rules.boarding.maxPerHost),
    cooldownMultiplier: String(rules.boarding.cooldownMultiplier),
    mealRetentionDays: String(rules.feeding.mealRetentionDays),
    thumbsPerStudentReward: String(rules.coaching.thumbsPerStudentReward),
    thumbsPerCoachReward: String(rules.coaching.thumbsPerCoachReward),
    mood: Object.fromEntries(MOOD_FIELDS.map((f) => [f, String(rules.mood[f])])) as Draft["mood"],
    defense: Object.fromEntries(DEFENSE_FIELDS.map((f) => [f, String(rules.defense[f])])) as Draft["defense"],
    maxPlaysPerDay: String(rules.play.maxPerDay),
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
    feeding: { maxMealsPerDay: num(draft.maxMealsPerDay), rejectScreenPhotos: draft.rejectScreenPhotos, mealRetentionDays: num(draft.mealRetentionDays) },
    boarding: { maxPerHost: num(draft.maxPerHost), cooldownMultiplier: num(draft.cooldownMultiplier) },
    coaching: { thumbsPerStudentReward: num(draft.thumbsPerStudentReward), thumbsPerCoachReward: num(draft.thumbsPerCoachReward) },
    mood: Object.fromEntries(MOOD_FIELDS.map((f) => [f, num(draft.mood[f])])) as GameRulesPatch["mood"],
    defense: Object.fromEntries(DEFENSE_FIELDS.map((f) => [f, num(draft.defense[f])])) as GameRulesPatch["defense"],
    play: { maxPerDay: num(draft.maxPlaysPerDay) },
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
      patch.boarding?.maxPerHost,
      patch.boarding?.cooldownMultiplier,
      patch.feeding?.mealRetentionDays,
      patch.coaching?.thumbsPerStudentReward,
      patch.coaching?.thumbsPerCoachReward,
      ...MOOD_FIELDS.map((f) => patch.mood?.[f]),
      ...DEFENSE_FIELDS.map((f) => patch.defense?.[f]),
      patch.play?.maxPerDay,
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
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Conservation des repas (jours)</span>
          <input type="text" inputMode="numeric" value={draft.mealRetentionDays} onChange={(e) => setDraft((d) => ({ ...d, mealRetentionDays: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">Photos et fiches supprimées au-delà, pour le joueur comme pour son coach · défaut {DEFAULT_RULES.feeding.mealRetentionDays}</span>
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

      <section className="grid gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card sm:grid-cols-2">
        <h2 className="font-display text-xl text-cream-50 sm:col-span-2">Pension chez un ami</h2>
        <p className="-mt-2 text-xs text-cream-500 sm:col-span-2">
          La durée maximale d&apos;une pension se règle par niveau, dans le tableau ci-dessus (« Pension maximale »).
        </p>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Créatures hébergées au maximum par joueur</span>
          <input type="text" inputMode="numeric" value={draft.maxPerHost} onChange={(e) => setDraft((d) => ({ ...d, maxPerHost: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">0 désactive la pension · défaut {DEFAULT_RULES.boarding.maxPerHost}</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Repos après une pension (× sa durée)</span>
          <input type="text" inputMode="decimal" value={draft.cooldownMultiplier} onChange={(e) => setDraft((d) => ({ ...d, cooldownMultiplier: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">
            Après X jours de pension effectifs, le propriétaire ne peut plus confier sa créature pendant X × cette valeur (0 = aucun repos) · défaut {DEFAULT_RULES.boarding.cooldownMultiplier}
          </span>
        </label>
      </section>

      <section className="grid gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card sm:grid-cols-2">
        <h2 className="font-display text-xl text-cream-50 sm:col-span-2">Coaching</h2>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Pouces nets par récompense de l&apos;élève</span>
          <input type="text" inputMode="numeric" value={draft.thumbsPerStudentReward} onChange={(e) => setDraft((d) => ({ ...d, thumbsPerStudentReward: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">Pouces verts moins pouces rouges · défaut {DEFAULT_RULES.coaching.thumbsPerStudentReward}</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Pouces donnés par récompense du coach</span>
          <input type="text" inputMode="numeric" value={draft.thumbsPerCoachReward} onChange={(e) => setDraft((d) => ({ ...d, thumbsPerCoachReward: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">Verts ou rouges, tous élèves confondus · défaut {DEFAULT_RULES.coaching.thumbsPerCoachReward}</span>
        </label>
      </section>

      <section className="grid gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card sm:grid-cols-2">
        <h2 className="font-display text-xl text-cream-50 sm:col-span-2">Effets de l&apos;humeur</h2>
        <p className="-mt-2 text-xs text-cream-500 sm:col-span-2">
          L&apos;humeur baisse chaque heure (tableau ci-dessus), remonte de +5 par repas et +15 par partie. Ces seuils décident de ses effets.
        </p>
        {MOOD_FIELDS.map((field) => (
          <label key={field} className="space-y-1 text-sm">
            <span className="text-cream-100">{MOOD_LABELS[field].label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.mood[field]}
              onChange={(e) => setDraft((d) => ({ ...d, mood: { ...d.mood, [field]: e.target.value } }))}
              className={inputClass}
            />
            <span className="block text-[11px] text-cream-700">
              {MOOD_LABELS[field].help} · défaut {DEFAULT_RULES.mood[field]}
            </span>
          </label>
        ))}
      </section>

      <section className="grid gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card sm:grid-cols-2">
        <h2 className="font-display text-xl text-cream-50 sm:col-span-2">Parties par jour</h2>
        <label className="space-y-1 text-sm">
          <span className="text-cream-100">Parties maximales par jour et par créature</span>
          <input type="text" inputMode="numeric" value={draft.maxPlaysPerDay} onChange={(e) => setDraft((d) => ({ ...d, maxPlaysPerDay: e.target.value }))} className={inputClass} />
          <span className="block text-[11px] text-cream-700">« Jouer » et « Défendre » confondus ; chaque partie donne +15 humeur et +5 XP · défaut {DEFAULT_RULES.play.maxPerDay}</span>
        </label>
      </section>

      <section className="grid gap-3 rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4 shadow-card sm:grid-cols-2">
        <h2 className="font-display text-xl text-cream-50 sm:col-span-2">Défendre (tower defense sur le marqueur)</h2>
        <p className="-mt-2 text-xs text-cream-500 sm:col-span-2">
          La malbouffe arrive par vagues vers la créature posée sur son marqueur ; le joueur lance des œufs. Les parties comptent dans la même limite quotidienne que le
          jeu « Jouer » et donnent les mêmes récompenses.
        </p>
        {DEFENSE_FIELDS.map((field) => (
          <label key={field} className="space-y-1 text-sm">
            <span className="text-cream-100">{DEFENSE_LABELS[field].label}</span>
            <input
              type="text"
              inputMode={DEFENSE_LABELS[field].integer ? "numeric" : "decimal"}
              value={draft.defense[field]}
              onChange={(e) => setDraft((d) => ({ ...d, defense: { ...d.defense, [field]: e.target.value } }))}
              className={inputClass}
            />
            <span className="block text-[11px] text-cream-700">
              {DEFENSE_LABELS[field].help} · défaut {DEFAULT_RULES.defense[field]}
            </span>
          </label>
        ))}
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
