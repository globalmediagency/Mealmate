import type { Metadata } from "next";
import Link from "next/link";
import { DropRateEditor } from "@/components/admin/drop-rate-editor";
import { Creature } from "@/components/creatures/creature";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin/auth";
import { ALL_SPECIES, getSpecies, speciesForTier } from "@/lib/creatures";
import { RARITIES, RARITY_LABELS, STAGES, TIER_CONFIG, TIERS, type Rarity, type Tier } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { formatChance, speciesWeights } from "@/lib/game/drops";
import { getDropWeights } from "@/lib/game/drops-service";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Créatures" };
export const dynamic = "force-dynamic";

const STATES: CreatureState[] = ["healthy", "tired", "sick", "dead"];
const STATE_LABELS: Record<CreatureState, string> = { healthy: "En forme", tired: "Fatiguée", sick: "Malade", dead: "Morte" };

type SearchParams = Promise<{ tier?: string; rarity?: string; species?: string; all?: string }>;

const isTier = (v: string | undefined): v is Tier => (TIERS as readonly string[]).includes(v ?? "");
const isRarity = (v: string | undefined): v is Rarity => (RARITIES as readonly string[]).includes(v ?? "");

function href(params: { tier?: string; rarity?: string; species?: string; all?: string }): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/admin/creatures?${s}` : "/admin/creatures";
}

export default async function AdminCreaturesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const dropWeights = await getDropWeights();
  const tier = isTier(params.tier) ? params.tier : undefined;
  const rarity = isRarity(params.rarity) ? params.rarity : undefined;
  const selected = params.species ? getSpecies(params.species) : undefined;
  const showAll = params.all === "1";
  const tiers = tier ? [tier] : TIERS;
  const filtered = tiers.flatMap((t) => speciesForTier(t).filter((s) => !rarity || s.rarity === rarity));
  const detailed = showAll ? filtered : selected ? [selected] : [];
  const keep = { tier: params.tier, rarity: params.rarity };

  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl font-semibold text-cream-50">Créatures</h1>
        <p className="mt-1 text-sm text-cream-500">
          {ALL_SPECIES.length} espèces, {TIERS.length} niveaux, {STAGES.length} stades d&apos;âge et {STATES.length} états. Touche une espèce pour voir tous ses visuels ;
          la chance d&apos;éclosion (en millièmes) se règle sous chaque niveau.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={!tier} href={href({ rarity: params.rarity })}>Tous les niveaux</FilterChip>
        {TIERS.map((t) => (
          <FilterChip key={t} active={tier === t} href={href({ tier: t, rarity: params.rarity })}>
            {TIER_CONFIG[t].label}
          </FilterChip>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-600" aria-hidden="true" />
        <FilterChip active={!rarity} href={href({ tier: params.tier })}>Toutes raretés</FilterChip>
        {RARITIES.map((r) => (
          <FilterChip key={r} active={rarity === r} href={href({ tier: params.tier, rarity: r })}>
            {RARITY_LABELS[r]}
          </FilterChip>
        ))}
        <span className="mx-1 h-5 w-px bg-ink-600" aria-hidden="true" />
        <FilterChip active={showAll} href={showAll ? href(keep) : href({ ...keep, all: "1" })}>
          {showAll ? "Replier les fiches" : `Déplier les ${filtered.length} fiches`}
        </FilterChip>
      </div>

      {detailed.length > 0 ? (
        <div className="space-y-6">
          {detailed.map((s) => (
            <SpeciesSheet key={s.id} id={s.id} closeHref={showAll ? undefined : href(keep)} chance={formatChance(speciesWeights(s.tier, dropWeights.species).find((w) => w.item.id === s.id)!)} />
          ))}
        </div>
      ) : null}

      {tiers.map((t) => {
        const weighted = speciesWeights(t, dropWeights.species);
        const chanceOf = new Map(weighted.map((w) => [w.item.id, w]));
        const list = speciesForTier(t).filter((s) => !rarity || s.rarity === rarity);
        if (list.length === 0) return null;
        return (
          <section key={t} className="space-y-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-2xl text-cream-50">{TIER_CONFIG[t].label}</h2>
              <span className="text-xs text-cream-500">
                {list.length} espèce{list.length > 1 ? "s" : ""} · {TIER_CONFIG[t].universe}
              </span>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {list.map((s) => (
                <li key={s.id}>
                  <Link
                    href={href({ ...keep, species: s.id })}
                    className={cn(
                      "flex h-full flex-col items-center gap-1 rounded-2xl border bg-ink-800/80 p-2 text-center transition-colors hover:border-sage-500/60",
                      selected?.id === s.id ? "border-sage-400" : "border-ink-600/80",
                    )}
                  >
                    <Creature species={s} stage="adulte" state="healthy" size={88} animated={false} />
                    <span className="truncate text-sm font-semibold text-cream-50">{s.name}</span>
                    <RarityBadge rarity={s.rarity} className="text-[10px]" />
                    <span className="text-[10px] tabular-nums text-cream-500">{chanceOf.get(s.id) ? formatChance(chanceOf.get(s.id)!) : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <DropRateEditor
              kind="species"
              title={`Probabilités d'éclosion · ${TIER_CONFIG[t].label}`}
              rows={weighted.map((w) => ({ id: w.item.id, name: w.item.name, rarity: w.item.rarity, defaultWeight: w.defaultWeight, weight: w.weight, overridden: w.overridden }))}
            />
          </section>
        );
      })}
    </div>
  );
}

function FilterChip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-10 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
        active ? "border-sage-400/70 bg-sage-500/15 text-sage-200" : "border-ink-600 bg-ink-800 text-cream-300 hover:border-ink-400",
      )}
    >
      {children}
    </Link>
  );
}

/** Every visual of one species: 4 age stages × 4 states, plus the silhouette. */
function SpeciesSheet({ id, closeHref, chance }: { id: string; closeHref?: string; chance?: string }) {
  const s = getSpecies(id);
  if (!s) return null;
  return (
    <section className="rounded-3xl border border-sage-500/40 bg-ink-800/80 p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl text-cream-50">{s.name}</h2>
        <Badge>{TIER_CONFIG[s.tier].label}</Badge>
        <RarityBadge rarity={s.rarity} />
        <code className="text-xs text-cream-700">{s.id}</code>
        {closeHref ? (
          <Link href={closeHref} className="ml-auto inline-flex min-h-10 items-center rounded-xl px-3 text-xs text-cream-500 hover:bg-ink-700 hover:text-cream-100">
            Fermer
          </Link>
        ) : null}
      </div>
      <p className="mb-3 text-sm text-cream-300">
        {s.tagline} <span className="text-cream-700">· objet signature au stade Sage : {s.signature}</span>
        {chance ? <span className="block text-xs text-cream-500">Chance d&apos;éclosion : {chance}</span> : null}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-2">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-cream-500">État \ Âge</th>
              {STAGES.map((stage) => (
                <th key={stage.id} className="text-xs font-medium text-cream-500">
                  {stage.label}
                  <span className="block font-normal text-cream-700">dès {stage.minXp} XP</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATES.map((state) => (
              <tr key={state}>
                <th className="text-left text-xs font-medium text-cream-500">{STATE_LABELS[state]}</th>
                {STAGES.map((stage) => (
                  <td key={stage.id} className="rounded-2xl bg-ink-900/60 p-1 text-center">
                    <Creature species={s} stage={stage.id} state={state} size={110} className="mx-auto" />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th className="text-left text-xs font-medium text-cream-500">Silhouette (collection)</th>
              <td className="rounded-2xl bg-ink-900/60 p-1 text-center">
                <Creature species={s} stage="adulte" silhouette size={110} className="mx-auto" />
              </td>
              <td colSpan={STAGES.length - 1} className="text-xs text-cream-700">
                Affichée dans la collection et sur le choix d&apos;œuf tant que l&apos;espèce n&apos;a pas été obtenue.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
