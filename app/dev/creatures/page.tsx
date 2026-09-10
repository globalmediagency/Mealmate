import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Creature } from "@/components/creatures/creature";
import { Egg } from "@/components/creatures/egg";
import { Environment } from "@/components/creatures/environment";
import { RarityBadge } from "@/components/creatures/rarity-badge";
import { ALL_SPECIES } from "@/lib/creatures";
import { STAGES, TIERS } from "@/lib/game/config";
import type { CreatureState } from "@/lib/game/creature-view";
import { isDevGalleryEnabled } from "@/lib/env";
import { DevGalleryControls } from "./controls";

export const metadata: Metadata = { title: "Galerie des créatures" };
export const dynamic = "force-dynamic";

const STATES: CreatureState[] = ["healthy", "tired", "sick", "dead"];
const STATE_LABELS: Record<CreatureState, string> = {
  healthy: "En forme",
  tired: "Fatiguée",
  sick: "Malade",
  dead: "Fantôme",
};

type SearchParams = Promise<{ species?: string; animated?: string; compact?: string }>;

export default async function DevCreaturesPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isDevGalleryEnabled()) notFound();
  const params = await searchParams;
  const animated = params.animated !== "0";
  const filter = params.species;
  const species = filter ? ALL_SPECIES.filter((s) => s.id === filter) : ALL_SPECIES;
  const compact = params.compact === "1";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 safe-top safe-bottom">
      <header className="py-5">
        <h1 className="font-display text-3xl font-semibold text-cream-50">Galerie des créatures</h1>
        <p className="mt-1 text-sm text-cream-500">
          {ALL_SPECIES.length} espèces · {STAGES.length} stades · {STATES.length} états. Page visible uniquement avec
          NEXT_PUBLIC_DEV_GALLERY=true.
        </p>
        <DevGalleryControls speciesIds={ALL_SPECIES.map((s) => ({ id: s.id, name: s.name }))} current={filter} animated={animated} />
      </header>

      {compact ? (
        <section className="mb-10">
          {TIERS.map((tier) => (
            <div key={tier} className="mb-6">
              <h2 className="mb-2 font-display text-xl capitalize text-cream-50">{tier}</h2>
              <div className="grid grid-cols-5 gap-2">
                {ALL_SPECIES.filter((s) => s.tier === tier).map((s) => (
                  <div key={s.id} className="rounded-2xl bg-ink-800/80 p-2 text-center">
                    <Creature species={s} stage="adulte" state="healthy" size={110} animated={animated} className="mx-auto" />
                    <p className="mt-1 truncate text-xs font-semibold text-cream-100">{s.name}</p>
                    <p className="text-[10px] text-cream-500">{s.rarity}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-3 font-display text-xl text-cream-50">Œufs et environnements</h2>
        <div className="grid grid-cols-3 gap-3">
          {TIERS.map((tier) => (
            <div key={tier} className="rounded-3xl border border-ink-600/80 bg-ink-800/80 p-3 text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream-500">{tier}</p>
              <div className="flex justify-center gap-1">
                {[0, 1, 2, 3, 4].map((crack) => (
                  <Egg key={crack} tier={tier} crack={crack as 0 | 1 | 2 | 3 | 4} size={44} animated={animated} />
                ))}
              </div>
              <div className="mt-3 h-24 overflow-hidden rounded-2xl">
                <Environment tier={tier} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {compact ? null : species.map((s) => (
        <section key={s.id} className="mb-10 rounded-3xl border border-ink-600/80 bg-ink-800/70 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl text-cream-50">{s.name}</h2>
            <RarityBadge rarity={s.rarity} />
            <code className="text-xs text-cream-700">{s.id}</code>
            <span className="text-xs text-cream-500">{s.tagline}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-2">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-cream-500" />
                  {STAGES.map((stage) => (
                    <th key={stage.id} className="text-xs font-medium text-cream-500">
                      {stage.label}
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
                        <Creature species={s} stage={stage.id} state={state} size={120} animated={animated} className="mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th className="text-left text-xs font-medium text-cream-500">Silhouette</th>
                  <td className="rounded-2xl bg-ink-900/60 p-1 text-center">
                    <Creature species={s} stage="adulte" silhouette size={120} className="mx-auto" />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
